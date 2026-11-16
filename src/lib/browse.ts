import config from '@payload-config'
import { getPayload, type Where } from 'payload'

import { CARD_FIELDS } from './catalogue'
import { type BookDocument, type BrowseQuery, type BrowseResult, PRICE_BANDS, searchIndex, SORTS, type SortKey } from './search'

export type RawParams = Record<string, string | string[] | undefined>

const list = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value.join(',') : (value ?? ''))
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : (value ?? ''))

/** Read filters, sort and page from the address bar. Unknown values are dropped. */
export const parseBrowseParams = (params: RawParams, scope?: BrowseQuery['scope']): BrowseQuery => {
  const sort = one(params.sort)
  return {
    q: one(params.q).trim().slice(0, 120) || undefined,
    scope,
    format: list(params.format),
    state: list(params.state),
    language: list(params.language),
    subject: list(params.subject),
    price: list(params.price).filter((k) => PRICE_BANDS.some((b) => b.key === k)),
    sort: sort in SORTS ? (sort as SortKey) : undefined,
    page: Math.max(1, Number(one(params.page)) || 1),
  }
}

/** The current address with some parameters changed. Changing a filter returns to page 1. */
export const hrefWith = (
  basePath: string,
  params: RawParams,
  changes: Record<string, string | undefined>,
): string => {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value.join(',') : value
    if (v) next.set(key, v)
  }
  if (!('page' in changes)) next.delete('page')
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  const qs = next.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Add or remove one value from a comma-separated filter. */
export const toggled = (current: string[], value: string): string | undefined => {
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return next.length ? next.join(',') : undefined
}

/**
 * Books for a grid page. Uses the search engine; if it cannot be reached, answers from the
 * database instead — without filters, but the shop stays browsable.
 */
export const browse = async (query: BrowseQuery): Promise<BrowseResult> => {
  try {
    return await searchIndex(query)
  } catch {
    return fallback(query)
  }
}

const fallback = async (query: BrowseQuery): Promise<BrowseResult> => {
  const payload = await getPayload({ config })
  const and: Where[] = [{ status: { equals: 'published' } }]
  if (query.q) {
    const isbn = query.q.replace(/[\s-]/g, '')
    and.push(
      /^\d{10,13}$/.test(isbn)
        ? { isbn13: { equals: isbn } }
        : { or: [{ title: { like: query.q } }, { authorLine: { like: query.q } }] },
    )
  }
  const bySlug = async (collection: 'subjects' | 'publishers' | 'series' | 'lists', slug: string) =>
    (await payload.find({ collection, where: { slug: { equals: slug } }, depth: 0, limit: 1 })).docs[0]

  if (query.scope?.subject) {
    const subject = await bySlug('subjects', query.scope.subject)
    const children = subject
      ? await payload.find({ collection: 'subjects', where: { parent: { equals: subject.id } }, depth: 0, pagination: false })
      : null
    and.push({ subjects: { in: subject ? [subject.id, ...(children?.docs ?? []).map((c) => c.id)] : [0] } })
  }
  if (query.scope?.publisher) and.push({ publisher: { equals: (await bySlug('publishers', query.scope.publisher))?.id ?? 0 } })
  if (query.scope?.series) and.push({ series: { equals: (await bySlug('series', query.scope.series))?.id ?? 0 } })

  const found = await payload.find({
    collection: 'editions',
    where: { and },
    select: CARD_FIELDS,
    depth: 0,
    limit: query.perPage ?? 24,
    page: query.page ?? 1,
    sort: query.sort === 'newest' ? '-createdAt' : query.sort === 'price-asc' ? 'price' : query.sort === 'price-desc' ? '-price' : 'title',
  })
  return {
    books: found.docs as unknown as BookDocument[],
    total: found.totalDocs,
    page: found.page ?? 1,
    totalPages: found.totalPages,
    facets: {},
    full: false,
  }
}
