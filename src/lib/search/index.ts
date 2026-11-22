import type { Payload } from 'payload'

import type { Contributor, Edition, Publisher, Series, Subject } from '../../payload-types'
import { availabilityOf } from '../availability'

/**
 * Search index for books, held in Meilisearch.
 *
 * The database stays the source of truth. Every time a book is saved it is copied into the
 * index (see the hooks on the Books collection); `pnpm search:reindex` rebuilds it from scratch.
 * If the search engine is unreachable the shop falls back to a plain database search.
 */
const INDEX = 'books'
const url = () => process.env.MEILI_URL || 'http://127.0.0.1:7700'

const call = async <T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> => {
  const res = await fetch(`${url()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MEILI_KEY ? { Authorization: `Bearer ${process.env.MEILI_KEY}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Search engine answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/** What is stored for each book: everything a card needs, plus what can be searched and filtered. */
export type BookDocument = {
  id: number
  title: string
  subtitle?: string | null
  slug: string
  /** 'item' for gifts and stationery (their pages are at /item/…). */
  kind: 'book' | 'item'
  authorLine?: string | null
  contributors: string[]
  isbn13: string
  publisher?: string | null
  publisherSlug?: string | null
  series?: string | null
  seriesSlug?: string | null
  subjects: string[] // slugs, including the parent subject
  subjectNames: string[]
  lists: string[]
  format: string
  language?: string | null
  price?: number | null
  compareAtPrice?: number | null
  coverUrl?: string | null
  state: 'in_stock' | 'pre_order' | 'on_request' | 'unavailable'
  sourcing: Edition['sourcing']
  stockOnHand: number
  expectedDate?: string | null
  leadTimeWeeks?: number | null
  year?: number | null
  addedAt: number
}

const obj = <T>(value: unknown): T | null => (value && typeof value === 'object' ? (value as T) : null)

export const toDocument = (book: Edition, parents: Map<number, Subject>, lists: string[] = []): BookDocument => {
  const subjects = (book.subjects ?? []).map((s) => obj<Subject>(s)).filter((s): s is Subject => s !== null)
  const withParents = subjects.flatMap((s) => {
    const parentId = typeof s.parent === 'object' ? s.parent?.id : s.parent
    const parent = parentId ? parents.get(parentId) : undefined
    return parent ? [s, parent] : [s]
  })
  const publisher = obj<Publisher>(book.publisher)
  const series = obj<Series>(book.series)
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    slug: book.slug,
    kind: book.kind === 'item' ? 'item' : 'book',
    authorLine: book.authorLine,
    contributors: (book.contributors ?? [])
      .map((c) => obj<Contributor>(c.contributor)?.name)
      .filter((n): n is string => Boolean(n)),
    isbn13: book.isbn13 ?? '',
    publisher: publisher?.name,
    publisherSlug: publisher?.slug,
    series: series?.name,
    seriesSlug: series?.slug,
    subjects: [...new Set(withParents.map((s) => s.slug))],
    subjectNames: [...new Set(withParents.map((s) => s.name))],
    lists,
    // Gifts and stationery are filtered by their type (Bookmark, Notebook…), books by format.
    format: book.kind === 'item' ? (book.itemType ?? 'other') : (book.format ?? 'paperback'),
    language: book.language,
    price: book.price,
    compareAtPrice: book.compareAtPrice,
    coverUrl: book.coverUrl,
    state: availabilityOf(book).state,
    sourcing: book.sourcing,
    stockOnHand: book.stockOnHand ?? 0,
    expectedDate: book.expectedDate,
    leadTimeWeeks: book.leadTimeWeeks,
    year: book.publicationDate ? new Date(book.publicationDate).getUTCFullYear() : null,
    addedAt: Math.floor(new Date(book.createdAt).getTime() / 1000),
  }
}

export const configureIndex = async (): Promise<void> => {
  await call(`/indexes`, { method: 'POST', body: JSON.stringify({ uid: INDEX, primaryKey: 'id' }) }).catch(() => undefined)
  await call(`/indexes/${INDEX}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      // Order matters: a match in the title outranks one in the publisher's name.
      searchableAttributes: ['title', 'authorLine', 'contributors', 'series', 'subtitle', 'isbn13', 'publisher', 'subjectNames'],
      filterableAttributes: ['subjects', 'lists', 'format', 'state', 'language', 'publisherSlug', 'seriesSlug', 'price', 'year', 'contributors'],
      sortableAttributes: ['price', 'year', 'addedAt', 'title', 'stockOnHand'],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'stockOnHand:desc'],
      typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 }, disableOnAttributes: ['isbn13'] },
      faceting: { maxValuesPerFacet: 60 },
      pagination: { maxTotalHits: 5000 },
    }),
  })
}

const subjectParents = async (payload: Payload): Promise<Map<number, Subject>> => {
  const all = await payload.find({ collection: 'subjects', depth: 0, pagination: false })
  return new Map(all.docs.map((s) => [s.id, s]))
}

const listMembership = async (payload: Payload): Promise<Map<number, string[]>> => {
  const lists = await payload.find({ collection: 'lists', depth: 0, pagination: false })
  const map = new Map<number, string[]>()
  for (const list of lists.docs) {
    for (const b of list.books ?? []) {
      const id = typeof b === 'object' ? b.id : b
      map.set(id, [...(map.get(id) ?? []), list.slug])
    }
  }
  return map
}

/** Copy one book into the index, or remove it if it is no longer published. Never throws. */
export const syncBook = async (payload: Payload, id: number): Promise<void> => {
  try {
    const book = await payload.findByID({ collection: 'editions', id, depth: 1, disableErrors: true })
    if (!book || book.status !== 'published') {
      await call(`/indexes/${INDEX}/documents/${id}`, { method: 'DELETE' })
      return
    }
    const [parents, lists] = await Promise.all([subjectParents(payload), listMembership(payload)])
    await call(`/indexes/${INDEX}/documents`, {
      method: 'POST',
      body: JSON.stringify([toDocument(book, parents, lists.get(id) ?? [])]),
    })
  } catch (err) {
    payload.logger.warn(`Search index not updated for book ${id}: ${err instanceof Error ? err.message : err}`)
  }
}

export const removeBook = async (payload: Payload, id: number): Promise<void> => {
  try {
    await call(`/indexes/${INDEX}/documents/${id}`, { method: 'DELETE' })
  } catch (err) {
    payload.logger.warn(`Search index not updated for book ${id}: ${err instanceof Error ? err.message : err}`)
  }
}

/** Rebuild the whole index from the database. */
export const reindexAll = async (payload: Payload): Promise<number> => {
  await configureIndex()
  const [parents, lists] = await Promise.all([subjectParents(payload), listMembership(payload)])
  const books = await payload.find({
    collection: 'editions',
    where: { status: { equals: 'published' } },
    depth: 1,
    pagination: false,
  })
  const docs = books.docs.map((b) => toDocument(b, parents, lists.get(b.id) ?? []))
  await call(`/indexes/${INDEX}/documents`, { method: 'DELETE' }, 15000)
  for (let i = 0; i < docs.length; i += 500) {
    await call(`/indexes/${INDEX}/documents`, { method: 'POST', body: JSON.stringify(docs.slice(i, i + 500)) }, 15000)
  }
  return docs.length
}

// ---------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------

export const SORTS = {
  relevance: { label: 'Best match', sort: [] as string[] },
  newest: { label: 'Newest', sort: ['addedAt:desc'] },
  'price-asc': { label: 'Price: low to high', sort: ['price:asc'] },
  'price-desc': { label: 'Price: high to low', sort: ['price:desc'] },
  title: { label: 'Title A–Z', sort: ['title:asc'] },
} as const
export type SortKey = keyof typeof SORTS

export const PRICE_BANDS = [
  { key: '0-1000', label: 'Under ৳1,000', min: 0, max: 999 },
  { key: '1000-1500', label: '৳1,000 – ৳1,500', min: 1000, max: 1500 },
  { key: '1500-2500', label: '৳1,500 – ৳2,500', min: 1501, max: 2500 },
  { key: '2500-', label: 'Over ৳2,500', min: 2501, max: 10_000_000 },
] as const

export type BrowseQuery = {
  q?: string
  /** Fixed scope of the page: a subject, collection, publisher or series. */
  scope?: { subject?: string; list?: string; publisher?: string; series?: string }
  format?: string[]
  state?: string[]
  language?: string[]
  subject?: string[]
  price?: string[]
  sort?: SortKey
  page?: number
  perPage?: number
}

export type BrowseResult = {
  books: BookDocument[]
  total: number
  page: number
  totalPages: number
  facets: Record<string, Record<string, number>>
  /** False when the search engine was unreachable and the plain database search answered. */
  full: boolean
}

const quote = (v: string) => `"${v.replace(/"/g, '\\"')}"`
const anyOf = (field: string, values?: string[]) =>
  values?.length ? `${field} IN [${values.map(quote).join(', ')}]` : null

export const searchIndex = async (query: BrowseQuery): Promise<BrowseResult> => {
  const filters = [
    query.scope?.subject ? `subjects = ${quote(query.scope.subject)}` : null,
    query.scope?.list ? `lists = ${quote(query.scope.list)}` : null,
    query.scope?.publisher ? `publisherSlug = ${quote(query.scope.publisher)}` : null,
    query.scope?.series ? `seriesSlug = ${quote(query.scope.series)}` : null,
    anyOf('format', query.format),
    anyOf('state', query.state),
    anyOf('language', query.language),
    anyOf('subjects', query.subject),
    query.price?.length
      ? `(${query.price
          .map((key) => PRICE_BANDS.find((b) => b.key === key))
          .filter((b): b is (typeof PRICE_BANDS)[number] => Boolean(b))
          .map((b) => `(price >= ${b.min} AND price <= ${b.max})`)
          .join(' OR ')})`
      : null,
  ].filter((f): f is string => Boolean(f) && f !== '()')

  const sortKey: SortKey = query.sort && query.sort in SORTS ? query.sort : query.q ? 'relevance' : 'title'
  const res = await call<{
    hits: BookDocument[]
    totalHits: number
    totalPages: number
    page: number
    facetDistribution?: Record<string, Record<string, number>>
  }>(`/indexes/${INDEX}/search`, {
    method: 'POST',
    body: JSON.stringify({
      q: query.q ?? '',
      filter: filters,
      facets: ['format', 'state', 'language', 'subjects'],
      sort: SORTS[sortKey].sort,
      page: query.page ?? 1,
      hitsPerPage: query.perPage ?? 24,
    }),
  })
  return {
    books: res.hits,
    total: res.totalHits,
    page: res.page,
    totalPages: res.totalPages,
    facets: res.facetDistribution ?? {},
    full: true,
  }
}

/** Up to six quick matches for the search box. */
export const suggest = async (q: string): Promise<Pick<BookDocument, 'id' | 'title' | 'slug' | 'kind' | 'authorLine' | 'coverUrl' | 'price' | 'state'>[]> => {
  const res = await call<{ hits: BookDocument[] }>(
    `/indexes/${INDEX}/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        q,
        limit: 6,
        attributesToRetrieve: ['id', 'title', 'slug', 'kind', 'authorLine', 'coverUrl', 'price', 'state'],
      }),
    },
    1500,
  )
  return res.hits
}
