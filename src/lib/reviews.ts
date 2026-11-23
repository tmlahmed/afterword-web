import type { Payload } from 'payload'

import type { Customer, Review } from '../payload-types'

/** Published reviews of a book, newest first. */
export const getReviews = async (payload: Payload, editionId: number, limit = 20): Promise<Review[]> =>
  (
    await payload.find({
      collection: 'reviews',
      where: { and: [{ edition: { equals: editionId } }, { status: { equals: 'published' } }] },
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: false, // as the public sees them: no customer or order fields
    })
  ).docs

export type ReviewSort = 'newest' | 'highest' | 'lowest'
/** A review as the public sees it, small enough to send to the browser. */
export type ReviewItem = { id: number; rating: number; title: string; body: string; displayName: string; createdAt: string; reply?: string | null }
export const REVIEWS_PER_PAGE = 5

const SORTS: Record<ReviewSort, string[]> = { newest: ['-createdAt'], highest: ['-rating', '-createdAt'], lowest: ['rating', '-createdAt'] }

/** One page of a book's published reviews, and whether there are more. */
export const reviewPage = async (
  payload: Payload,
  editionId: number,
  page = 1,
  sort: ReviewSort = 'newest',
  perPage = REVIEWS_PER_PAGE,
): Promise<{ items: ReviewItem[]; hasMore: boolean }> => {
  const found = await payload.find({
    collection: 'reviews',
    where: { and: [{ edition: { equals: editionId } }, { status: { equals: 'published' } }] },
    sort: SORTS[sort] ?? SORTS.newest,
    limit: Math.min(20, Math.max(1, Math.floor(perPage))),
    page: Math.max(1, Math.floor(page)),
    depth: 0,
    overrideAccess: false, // as the public sees them: no customer or order fields
  })
  return {
    items: found.docs.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.displayName ?? 'A reader', createdAt: r.createdAt, reply: r.reply })),
    hasMore: found.hasNextPage,
  }
}

/** How many published reviews gave each number of stars, for the bars beside the average. */
export const ratingCounts = async (payload: Payload, editionId: number): Promise<Record<1 | 2 | 3 | 4 | 5, number>> => {
  const found = await payload.find({
    collection: 'reviews',
    where: { and: [{ edition: { equals: editionId } }, { status: { equals: 'published' } }] },
    select: { rating: true },
    pagination: false,
    depth: 0,
    overrideAccess: false,
  })
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of found.docs) {
    const n = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5
    counts[n]++
  }
  return counts
}

/**
 * Can this customer review this book? Only after an order with the book has been delivered,
 * and only once per book. Returns the order to link the review to.
 */
export const reviewEligibility = async (
  payload: Payload,
  customer: Pick<Customer, 'id'> | null,
  editionId: number,
): Promise<{ canReview: false; reason: 'signed_out' | 'not_bought' | 'already' } | { canReview: true; orderId: number }> => {
  if (!customer) return { canReview: false, reason: 'signed_out' }
  const [orders, existing] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { and: [{ customer: { equals: customer.id } }, { status: { equals: 'delivered' } }, { 'lines.edition': { equals: editionId } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    payload.count({ collection: 'reviews', where: { and: [{ customer: { equals: customer.id } }, { edition: { equals: editionId } }] }, overrideAccess: true }),
  ])
  if (existing.totalDocs > 0) return { canReview: false, reason: 'already' }
  if (!orders.docs[0]) return { canReview: false, reason: 'not_bought' }
  return { canReview: true, orderId: orders.docs[0].id }
}

export type BookToReview = { id: number; title: string; slug: string; kind?: 'book' | 'item' | null; authorLine?: string | null; coverUrl?: string | null; deliveredAt: string }

/**
 * Books from a customer's delivered orders that they have not reviewed yet, the most recently
 * delivered first (when the book is freshest in the reader's mind).
 */
export const booksToReview = async (payload: Payload, customerId: number): Promise<BookToReview[]> => {
  const [orders, reviewed] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { and: [{ customer: { equals: customerId } }, { status: { equals: 'delivered' } }] },
      sort: '-updatedAt',
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({ collection: 'reviews', where: { customer: { equals: customerId } }, select: { edition: true }, depth: 0, pagination: false, overrideAccess: true }),
  ])
  const done = new Set(reviewed.docs.map((r) => (typeof r.edition === 'object' ? r.edition.id : r.edition)))
  // Each book with the date of the latest delivered order it came in.
  const deliveredAt = new Map<number, string>()
  for (const o of orders.docs) {
    for (const l of o.lines ?? []) {
      const id = typeof l.edition === 'object' ? l.edition.id : l.edition
      if (!done.has(id) && !deliveredAt.has(id)) deliveredAt.set(id, o.updatedAt)
    }
  }
  if (!deliveredAt.size) return []
  const books = await payload.find({
    collection: 'editions',
    where: { and: [{ id: { in: [...deliveredAt.keys()] } }, { status: { equals: 'published' } }] },
    select: { title: true, slug: true, kind: true, authorLine: true, coverUrl: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return books.docs
    .map((b) => ({ id: b.id, title: b.title, slug: b.slug, kind: b.kind, authorLine: b.authorLine, coverUrl: b.coverUrl, deliveredAt: deliveredAt.get(b.id)! }))
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))
}

export type MyReview = {
  id: number
  rating: number
  title: string
  body: string
  displayName: string
  status: 'pending' | 'published' | 'rejected'
  reply?: string | null
  createdAt: string
  updatedAt: string
  book: { id: number; title: string; slug: string; kind?: 'book' | 'item' | null; authorLine?: string | null; coverUrl?: string | null } | null
}

/** Every review a customer has written, newest first, with its book and where it stands. */
export const customerReviews = async (payload: Payload, customerId: number): Promise<MyReview[]> => {
  const found = await payload.find({
    collection: 'reviews',
    where: { customer: { equals: customerId } },
    sort: '-updatedAt',
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs.map((r) => {
    const b = typeof r.edition === 'object' ? r.edition : null
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      displayName: r.displayName,
      status: r.status,
      reply: r.reply,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      book: b ? { id: b.id, title: b.title, slug: b.slug, kind: b.kind, authorLine: b.authorLine, coverUrl: b.coverUrl } : null,
    }
  })
}

/** "Tamal Ahmed" → "Tamal A." */
export const shortName = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A reader'
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}
