import type { Payload, PayloadRequest } from 'payload'

import type { Edition } from '../../payload-types'
import { storeCover } from '../covers'
import { slugify } from '../slug'
import { normaliseIsbn } from './isbn'
import { type BookRecord, lookupIsbn } from './sources'

export type ImportResult =
  | { ok: true; created: boolean; edition: Edition }
  | { ok: false; reason: 'invalid_isbn' | 'not_found'; message: string }

type Options = {
  /** Values that replace whatever the sources return (used by the seed and by staff corrections). */
  overrides?: Partial<BookRecord>
  /** Book data already looked up, to skip a second round of requests. */
  prefetched?: BookRecord | null
  /** Extra fields set on the new book, e.g. subjects, list price, status. */
  extra?: Partial<Edition>
  req?: PayloadRequest
  /** Copy the cover into the shop's image store (default true). */
  copyCover?: boolean
}

const findOrCreate = async (
  payload: Payload,
  collection: 'contributors' | 'publishers',
  name: string,
  req?: PayloadRequest,
): Promise<number> => {
  const slug = slugify(name)
  const existing = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0, req })
  if (existing.docs[0]) return existing.docs[0].id
  const created = await payload.create({ collection, data: { name, slug }, depth: 0, req })
  return created.id
}

const findOrCreateWork = async (
  payload: Payload,
  record: BookRecord,
  authorName: string | undefined,
  req?: PayloadRequest,
): Promise<number> => {
  if (record.workKey) {
    const byKey = await payload.find({
      collection: 'works',
      where: { sourceKey: { equals: record.workKey } },
      limit: 1,
      depth: 0,
      req,
    })
    if (byKey.docs[0]) return byKey.docs[0].id
  }
  const title = record.workTitle ?? record.title ?? 'Untitled'
  // Slug includes the author so "Selected Poems" by two poets stay separate works.
  const slug = slugify([title, authorName].filter(Boolean).join(' '))
  const bySlug = await payload.find({ collection: 'works', where: { slug: { equals: slug } }, limit: 1, depth: 0, req })
  if (bySlug.docs[0]) return bySlug.docs[0].id
  const created = await payload.create({
    collection: 'works',
    data: { title, slug, firstPublished: record.firstPublished, sourceKey: record.workKey },
    depth: 0,
    req,
  })
  return created.id
}

/**
 * Add a book to the catalogue from its ISBN. Looks the ISBN up in the book-data sources,
 * creates the author, publisher and work records it needs, and saves the book as a draft
 * for a person to check. If the ISBN is already in the catalogue, returns the existing book.
 */
export const importBook = async (payload: Payload, rawIsbn: string, options: Options = {}): Promise<ImportResult> => {
  const { overrides = {}, extra = {}, prefetched, req } = options
  const isbn13 = normaliseIsbn(rawIsbn)
  if (!isbn13) {
    return { ok: false, reason: 'invalid_isbn', message: `"${rawIsbn}" is not a valid ISBN.` }
  }

  const existing = await payload.find({
    collection: 'editions',
    where: { isbn13: { equals: isbn13 } },
    limit: 1,
    depth: 0,
    req,
  })
  if (existing.docs[0]) return { ok: true, created: false, edition: existing.docs[0] }

  const looked = prefetched === undefined ? await lookupIsbn(isbn13) : prefetched
  const record: BookRecord | null = looked || overrides.title ? { isbn13, source: 'Manual', ...looked, ...overrides } : null
  if (!record?.title) {
    return {
      ok: false,
      reason: 'not_found',
      message: `No book data found for ISBN ${isbn13}. You can still add it by hand.`,
    }
  }

  const contributors: { contributor: number; role: NonNullable<BookRecord['contributors']>[number]['role'] }[] = []
  for (const c of record.contributors ?? []) {
    const id = await findOrCreate(payload, 'contributors', c.name, req)
    if (!contributors.some((x) => x.contributor === id && x.role === c.role)) {
      contributors.push({ contributor: id, role: c.role })
    }
  }
  const firstAuthor = record.contributors?.find((c) => c.role === 'author')?.name
  const publisher = record.publisher ? await findOrCreate(payload, 'publishers', record.publisher, req) : undefined
  const work = await findOrCreateWork(payload, record, firstAuthor, req)

  // A source may give a full date, a bare year, or something unusable.
  const publishedText = record.published && /^\d{4}$/.test(record.published) ? `${record.published}-01-01` : record.published
  const publishedAt = publishedText ? new Date(publishedText) : null
  // ISBNs began in 1967, so an earlier date is the work's first publication, not this edition's.
  const publicationDate =
    publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt.getUTCFullYear() >= 1967
      ? publishedAt.toISOString()
      : undefined

  const edition = await payload.create({
    collection: 'editions',
    data: {
      title: record.title,
      subtitle: record.subtitle,
      isbn13,
      slug: `${slugify(record.title)}-${isbn13}`,
      contributors,
      synopsis: record.synopsis,
      coverUrl: record.coverUrl,
      work,
      publisher,
      format: record.format ?? 'paperback',
      publicationDate,
      language: record.language ?? 'English',
      pages: record.pages,
      sourcing: 'standard',
      status: 'draft',
      importSource: record.source,
      ...extra,
    },
    depth: 0,
    req,
  })

  // Copy the cover into our own image store. A failure keeps the imported link.
  if (record.coverUrl && options.copyCover !== false) {
    if ((await storeCover(payload, edition.id)) === 'stored') {
      const fresh = await payload.findByID({ collection: 'editions', id: edition.id, depth: 0, req })
      return { ok: true, created: true, edition: fresh }
    }
  }

  return { ok: true, created: true, edition }
}
