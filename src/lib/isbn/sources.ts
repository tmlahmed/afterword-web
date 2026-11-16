/**
 * Book-data sources. Each one answers "what do you know about this ISBN?" in the same shape,
 * so sources can be tried in order and a paid one (ISBNdb) can be added later without
 * touching the importer.
 */
export type BookRecord = {
  isbn13: string
  title?: string
  subtitle?: string
  contributors?: { name: string; role: 'author' | 'translator' | 'illustrator' | 'editor' | 'introduction' }[]
  publisher?: string
  /** ISO date (yyyy-mm-dd) or a bare year. */
  published?: string
  pages?: number
  format?: 'paperback' | 'hardback' | 'board'
  language?: string
  synopsis?: string
  coverUrl?: string
  /** A stable key for the work this edition belongs to, when the source has one. */
  workKey?: string
  workTitle?: string
  firstPublished?: number
  source: string
}

export type BookSource = {
  name: string
  lookup: (isbn13: string) => Promise<BookRecord | null>
}

const USER_AGENT = 'AfterwordCatalogue/0.1 (bookshop catalogue importer)'

export const getJson = async <T>(url: string, attempt = 0): Promise<T | null> => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    // Be polite when a source asks us to slow down: wait, then try once more.
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)))
      return getJson<T>(url, attempt + 1)
    }
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined
  if (value && typeof value === 'object' && 'value' in value) return text((value as { value: unknown }).value)
  return undefined
}

const mapFormat = (value?: string): BookRecord['format'] => {
  const v = (value ?? '').toLowerCase()
  if (!v) return undefined
  if (v.includes('board')) return 'board'
  if (v.includes('hard') || v.includes('cloth')) return 'hardback'
  if (v.includes('paper') || v.includes('soft') || v.includes('mass market')) return 'paperback'
  return undefined
}

const LANGUAGES: Record<string, string> = {
  eng: 'English', en: 'English', ben: 'Bengali', bn: 'Bengali', fre: 'French', fr: 'French',
  spa: 'Spanish', es: 'Spanish', ger: 'German', de: 'German', hin: 'Hindi', hi: 'Hindi',
  jpn: 'Japanese', ja: 'Japanese', ara: 'Arabic', ar: 'Arabic', urd: 'Urdu', ur: 'Urdu',
}

const mapRole = (value?: string): NonNullable<BookRecord['contributors']>[number]['role'] | null => {
  const v = (value ?? '').toLowerCase()
  if (v.includes('translat')) return 'translator'
  if (v.includes('illustrat')) return 'illustrator'
  if (v.includes('edit')) return 'editor'
  if (v.includes('introduc') || v.includes('foreword')) return 'introduction'
  return null
}

/** Remove trailing source credits and collapse whitespace in publisher copy. */
const tidy = (value?: string): string | undefined =>
  value
    ?.replace(/\r/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*{1,3}|_{2,3}/g, '') // markdown emphasis left in by some sources
    .replace(/\[\d+\]/g, '')
    .replace(/\(\[?source\]?.*$/is, '')
    .replace(/-{3,}[\s\S]*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || undefined

// ---------------------------------------------------------------------------
// Open Library — free, no key. Good on editions and covers, patchy on synopses.
// ---------------------------------------------------------------------------

type OLEdition = {
  title?: string
  subtitle?: string
  publishers?: string[]
  publish_date?: string
  number_of_pages?: number
  physical_format?: string
  covers?: number[]
  languages?: { key: string }[]
  works?: { key: string }[]
  authors?: { key: string }[]
  contributors?: { role?: string; name?: string }[]
  description?: unknown
}
type OLWork = {
  title?: string
  description?: unknown
  covers?: number[]
  authors?: { author?: { key: string } }[]
  first_publish_date?: string
}

const parsePublished = (value?: string): string | undefined => {
  if (!value) return undefined
  const year = value.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]
  if (!year) return undefined
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed) && /[a-z]/i.test(value)) return new Date(parsed).toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return year
}

export const openLibrary: BookSource = {
  name: 'Open Library',
  lookup: async (isbn13) => {
    const edition = await getJson<OLEdition>(`https://openlibrary.org/isbn/${isbn13}.json`)
    if (!edition?.title) return null

    const workKey = edition.works?.[0]?.key
    const work = workKey ? await getJson<OLWork>(`https://openlibrary.org${workKey}.json`) : null

    const authorKeys = [
      ...(edition.authors ?? []).map((a) => a.key),
      ...(work?.authors ?? []).map((a) => a.author?.key),
    ].filter((k): k is string => Boolean(k))
    const uniqueKeys = [...new Set(authorKeys)].slice(0, 4)
    const authors = await Promise.all(
      uniqueKeys.map((key) => getJson<{ name?: string }>(`https://openlibrary.org${key}.json`)),
    )

    const contributors: NonNullable<BookRecord['contributors']> = []
    for (const a of authors) if (a?.name) contributors.push({ name: a.name, role: 'author' })
    for (const c of edition.contributors ?? []) {
      const role = mapRole(c.role)
      if (role && c.name) contributors.push({ name: c.name, role })
    }

    const coverId = edition.covers?.find((id) => id > 0) ?? work?.covers?.find((id) => id > 0)
    const language = edition.languages?.[0]?.key.split('/').pop()

    return {
      isbn13,
      title: edition.title,
      subtitle: edition.subtitle,
      contributors,
      publisher: edition.publishers?.[0],
      published: parsePublished(edition.publish_date),
      pages: edition.number_of_pages,
      format: mapFormat(edition.physical_format),
      language: language ? LANGUAGES[language] : undefined,
      synopsis: tidy(text(edition.description) ?? text(work?.description)),
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
      workKey: workKey ? `openlibrary:${workKey}` : undefined,
      workTitle: work?.title,
      firstPublished: Number(work?.first_publish_date?.match(/\d{4}/)?.[0]) || undefined,
      source: 'Open Library',
    }
  },
}

// ---------------------------------------------------------------------------
// Google Books — free, no key at low volume. Better synopses, weaker on editions.
// ---------------------------------------------------------------------------

type GBVolume = {
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    pageCount?: number
    language?: string
    imageLinks?: { thumbnail?: string }
  }
}

export const googleBooks: BookSource = {
  name: 'Google Books',
  lookup: async (isbn13) => {
    const data = await getJson<{ items?: GBVolume[] }>(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&maxResults=1`,
    )
    const info = data?.items?.[0]?.volumeInfo
    if (!info?.title) return null
    return {
      isbn13,
      title: info.title,
      subtitle: info.subtitle,
      contributors: (info.authors ?? []).map((name) => ({ name, role: 'author' as const })),
      publisher: info.publisher,
      published: parsePublished(info.publishedDate),
      pages: info.pageCount || undefined,
      language: info.language ? LANGUAGES[info.language] : undefined,
      synopsis: tidy(info.description),
      coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, 'https:').replace('&edge=curl', ''),
      source: 'Google Books',
    }
  },
}

/** Sources in the order they are tried. Add ISBNdb here once there is an API key. */
export const SOURCES: BookSource[] = [openLibrary, googleBooks]

/** Ask every source and merge: the first source to know a field wins. */
export const lookupIsbn = async (isbn13: string, sources: BookSource[] = SOURCES): Promise<BookRecord | null> => {
  const found = (await Promise.all(sources.map((s) => s.lookup(isbn13)))).filter(
    (r): r is BookRecord => r !== null,
  )
  if (found.length === 0) return null
  const merged: BookRecord = { isbn13, source: found.map((r) => r.source).join(' + ') }
  for (const record of found) {
    for (const [key, value] of Object.entries(record)) {
      if (key === 'source' || key === 'isbn13') continue
      const current = (merged as Record<string, unknown>)[key]
      const empty = current === undefined || (Array.isArray(current) && current.length === 0)
      const usable = value !== undefined && !(Array.isArray(value) && value.length === 0)
      if (empty && usable) (merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}
