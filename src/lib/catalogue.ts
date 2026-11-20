import config from '@payload-config'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Edition, List, Note, Subject } from '../payload-types'

/** The fields a book card needs — kept small so shelves stay fast. */
export const CARD_FIELDS = {
  title: true,
  slug: true,
  authorLine: true,
  coverUrl: true,
  price: true,
  compareAtPrice: true,
  format: true,
  sourcing: true,
  stockOnHand: true,
  expectedDate: true,
  leadTimeWeeks: true,
} as const

export type BookCardData = Pick<Edition, 'id' | keyof typeof CARD_FIELDS>

const PUBLISHED: Where = { status: { equals: 'published' } }

const client = cache(async () => getPayload({ config }))

export const getSettings = cache(async () => (await client()).findGlobal({ slug: 'site-settings' }))

const idOf = (value: number | { id: number } | null | undefined): number | undefined =>
  typeof value === 'object' && value !== null ? value.id : (value ?? undefined)

/** Books by id, returned in the order the ids were given (collections are hand-ordered). */
const booksInOrder = async (ids: number[], limit: number): Promise<BookCardData[]> => {
  if (ids.length === 0) return []
  const payload = await client()
  const found = await payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, { id: { in: ids } }] },
    select: CARD_FIELDS,
    depth: 0,
    limit: ids.length,
    pagination: false,
  })
  const byId = new Map(found.docs.map((d) => [d.id, d]))
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .slice(0, limit)
}

const findCards = async (where: Where, limit: number, sort = '-createdAt', page = 1) => {
  const payload = await client()
  return payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, where] },
    select: CARD_FIELDS,
    depth: 0,
    limit,
    page,
    sort,
  })
}

export type HomeShelf = { title: string; intro?: string | null; href?: string; books: BookCardData[] }

export const getHome = cache(async () => {
  const payload = await client()
  const home = await payload.findGlobal({ slug: 'home', depth: 1 })

  const shelves: HomeShelf[] = []
  for (const shelf of home.shelves ?? []) {
    const limit = shelf.limit ?? 12
    let books: BookCardData[] = []
    let href: string | undefined
    if (shelf.source === 'list' && shelf.list && typeof shelf.list === 'object') {
      const list = shelf.list as List
      books = await booksInOrder((list.books ?? []).map(idOf).filter((id): id is number => Boolean(id)), limit)
      href = `/collections/${list.slug}`
    } else if (shelf.source === 'in_stock') {
      books = (await findCards({ and: [{ stockOnHand: { greater_than: 0 } }, { sourcing: { equals: 'standard' } }] }, limit, '-updatedAt')).docs
    } else if (shelf.source === 'pre_order') {
      books = (await findCards({ sourcing: { equals: 'pre_order' } }, limit, 'expectedDate')).docs
    } else if (shelf.source === 'newest') {
      books = (await findCards({}, limit)).docs
    }
    if (books.length > 0) shelves.push({ title: shelf.title, intro: shelf.intro, href, books })
  }

  const featureId = idOf(home.feature?.edition as number | { id: number } | null | undefined)
  const feature = featureId ? await getBookById(featureId) : null
  const featureNote = typeof home.feature?.note === 'object' ? (home.feature.note as Note) : null

  let quote: { note: Note; book: BookCardData } | null = null
  if (home.quote && typeof home.quote === 'object') {
    const note = home.quote as Note
    const bookId = idOf(note.edition as number | { id: number })
    const [book] = bookId ? await booksInOrder([bookId], 1) : []
    if (book) quote = { note, book }
  }

  return { eyebrow: home.feature?.eyebrow, feature, featureNote, shelves, quote }
})

const getBookById = async (id: number): Promise<Edition | null> => {
  const payload = await client()
  const found = await payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, { id: { equals: id } }] },
    depth: 1,
    limit: 1,
  })
  return found.docs[0] ?? null
}

export const getBookBySlug = cache(async (slug: string): Promise<Edition | null> => {
  const payload = await client()
  const found = await payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    depth: 1,
    limit: 1,
  })
  return found.docs[0] ?? null
})

/** The note a bookseller chose for the book; failing that, the most recently edited one. */
export const getNoteFor = async (editionId: number): Promise<Note | null> => (await getNotesFor([editionId])).get(editionId) ?? null

/** Other editions of the same work, books by the same author, and books on the same shelf of the shop. */
export const getRelated = async (book: Edition) => {
  const workId = idOf(book.work as number | { id: number } | null)
  const authorIds = (book.contributors ?? [])
    .filter((c) => c.role === 'author')
    .map((c) => idOf(c.contributor as number | { id: number }))
    .filter((id): id is number => Boolean(id))
  const subjectIds = (book.subjects ?? []).map((s) => idOf(s as number | { id: number })).filter((id): id is number => Boolean(id))
  const notThis: Where = { id: { not_equals: book.id } }

  const [editions, byAuthor, bySubject] = await Promise.all([
    workId ? findCards({ and: [notThis, { work: { equals: workId } }] }, 6) : null,
    authorIds.length
      ? findCards(
          {
            and: [
              notThis,
              { 'contributors.contributor': { in: authorIds } },
              ...(workId ? [{ work: { not_equals: workId } }] : []),
            ],
          },
          10,
        )
      : null,
    subjectIds.length ? findCards({ and: [notThis, { subjects: { in: subjectIds } }] }, 12, '-stockOnHand') : null,
  ])

  const seen = new Set<number>([book.id, ...(byAuthor?.docs ?? []).map((d) => d.id)])
  return {
    editions: editions?.docs ?? [],
    byAuthor: byAuthor?.docs ?? [],
    bySubject: (bySubject?.docs ?? []).filter((d) => !seen.has(d.id)).slice(0, 10),
  }
}

export const getSubjectTree = cache(async () => {
  const payload = await client()
  const all = await payload.find({ collection: 'subjects', depth: 0, pagination: false, sort: 'name' })
  const parents = all.docs.filter((s) => !s.parent)
  return parents.map((p) => ({ ...p, children: all.docs.filter((s) => idOf(s.parent as number | null) === p.id) }))
})

export const getLists = cache(async () => {
  const payload = await client()
  return (await payload.find({ collection: 'lists', depth: 0, pagination: false, sort: 'title' })).docs
})

export const getListPage = async (slug: string) => {
  const payload = await client()
  const found = await payload.find({ collection: 'lists', where: { slug: { equals: slug } }, depth: 0, limit: 1 })
  const list = found.docs[0]
  if (!list) return null
  const ids = (list.books ?? []).map((b) => idOf(b as number | { id: number })).filter((id): id is number => Boolean(id))
  return { list, books: await booksInOrder(ids, 200) }
}

// ---------------------------------------------------------------------------
// Phase 2: menus, authors, series, publishers, subject landings, journal, pages
// ---------------------------------------------------------------------------

export const getBooksByIds = (ids: number[], limit = 100) => booksInOrder(ids.slice(0, limit), limit)

export type MenuItem = {
  label: string
  href: string
  children: { label: string; href: string }[]
  highlights: { label: string; href: string }[]
  featured: BookCardData | null
}

/** The main menu as arranged in the admin. Falls back to the subject tree if it has not been set up. */
export const getNavigation = cache(async (): Promise<MenuItem[]> => {
  const payload = await client()
  const [nav, tree] = await Promise.all([payload.findGlobal({ slug: 'navigation', depth: 1 }), getSubjectTree()])
  const items: MenuItem[] = []
  for (const item of nav.items ?? []) {
    const subject = item.type === 'subject' && typeof item.subject === 'object' ? item.subject : null
    const list = item.type === 'list' && typeof item.list === 'object' ? item.list : null
    const href = subject ? `/subjects/${subject.slug}` : list ? `/collections/${list.slug}` : item.type === 'url' ? item.url : null
    if (!href) continue
    const featuredId = idOf(item.featured as number | { id: number } | null | undefined)
    const [featured] = featuredId ? await booksInOrder([featuredId], 1) : []
    items.push({
      label: item.label,
      href,
      children: subject
        ? (tree.find((t) => t.id === subject.id)?.children ?? []).map((c) => ({ label: c.name, href: `/subjects/${c.slug}` }))
        : [],
      highlights: (item.highlights ?? [])
        .filter((h): h is List => typeof h === 'object')
        .map((h) => ({ label: h.title, href: `/collections/${h.slug}` })),
      featured: featured ?? null,
    })
  }
  if (items.length) return items
  return tree.map((s) => ({
    label: s.name,
    href: `/subjects/${s.slug}`,
    children: s.children.map((c) => ({ label: c.name, href: `/subjects/${c.slug}` })),
    highlights: [],
    featured: null,
  }))
})

export const getAuthorPage = async (slug: string) => {
  const payload = await client()
  const found = await payload.find({ collection: 'contributors', where: { slug: { equals: slug } }, depth: 1, limit: 1 })
  const author = found.docs[0]
  if (!author) return null
  const books = await payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, { 'contributors.contributor': { equals: author.id } }] },
    select: { ...CARD_FIELDS, series: true, seriesNumber: true, publicationDate: true, contributors: true },
    depth: 1,
    limit: 200,
    sort: 'title',
  })
  return { author, books: books.docs }
}

export const getSeriesPage = async (slug: string) => {
  const payload = await client()
  const found = await payload.find({ collection: 'series', where: { slug: { equals: slug } }, depth: 0, limit: 1 })
  const series = found.docs[0]
  if (!series) return null
  const books = await payload.find({
    collection: 'editions',
    where: { and: [PUBLISHED, { series: { equals: series.id } }] },
    select: { ...CARD_FIELDS, seriesNumber: true },
    depth: 0,
    limit: 100,
    sort: 'seriesNumber',
  })
  return { series, books: books.docs }
}

export const getPublisher = async (slug: string) => {
  const payload = await client()
  const found = await payload.find({ collection: 'publishers', where: { slug: { equals: slug } }, depth: 1, limit: 1 })
  return found.docs[0] ?? null
}

/** The bookseller note for each of these books, where one exists. */
export const getNotesFor = async (editionIds: number[]): Promise<Map<number, Note>> => {
  if (editionIds.length === 0) return new Map()
  const payload = await client()
  const found = await payload.find({
    collection: 'notes',
    where: { edition: { in: editionIds } },
    depth: 0,
    pagination: false,
    sort: '-updatedAt',
  })
  const map = new Map<number, Note>()
  // Newest first, so the first note seen for a book is the newest; a chosen note replaces it.
  for (const note of found.docs) {
    const id = idOf(note.edition as number | { id: number })
    if (id && (!map.has(id) || (note.chosen && !map.get(id)!.chosen))) map.set(id, note)
  }
  return map
}

/**
 * A subject's landing page: its featured book, the shelves curated for it, then automatic
 * shelves — in stock, newest, and one per sub-subject — so the page is never a bare grid.
 */
export const getSubjectLanding = async (slug: string) => {
  const payload = await client()
  const found = await payload.find({ collection: 'subjects', where: { slug: { equals: slug } }, depth: 1, limit: 1 })
  const subject = found.docs[0]
  if (!subject) return null
  const children = (
    await payload.find({ collection: 'subjects', where: { parent: { equals: subject.id } }, depth: 0, pagination: false, sort: 'name' })
  ).docs
  const ids = [subject.id, ...children.map((c) => c.id)]
  const inSubject: Where = { subjects: { in: ids } }

  const shelves: HomeShelf[] = []
  for (const shelf of subject.shelves ?? []) {
    if (typeof shelf.list !== 'object') continue
    const list = shelf.list as List
    const books = await booksInOrder((list.books ?? []).map(idOf).filter((id): id is number => Boolean(id)), 12)
    if (books.length) shelves.push({ title: shelf.title, intro: shelf.intro, href: `/collections/${list.slug}`, books })
  }

  const all = `/subjects/${subject.slug}/all`
  const [inStock, newest, total] = await Promise.all([
    findCards({ and: [inSubject, { stockOnHand: { greater_than: 0 } }, { sourcing: { equals: 'standard' } }] }, 12, '-stockOnHand'),
    findCards(inSubject, 12, '-publicationDate'),
    payload.count({ collection: 'editions', where: { and: [PUBLISHED, inSubject] } }),
  ])
  if (inStock.docs.length >= 4) {
    shelves.push({ title: `In stock in ${subject.name}`, intro: 'On our shelves in Dhaka today.', href: `${all}?state=in_stock`, books: inStock.docs })
  }
  if (children.length === 0 && newest.docs.length >= 4) {
    shelves.push({ title: 'Recently published', href: `${all}?sort=newest`, books: newest.docs })
  }
  for (const child of children) {
    const books = await findCards({ subjects: { in: [child.id] } }, 12, '-stockOnHand')
    if (books.docs.length) shelves.push({ title: child.name, intro: child.intro, href: `/subjects/${child.slug}`, books: books.docs })
  }

  const featureId = idOf(subject.feature as number | { id: number } | null | undefined)
  const feature = featureId ? await getBookById(featureId) : null
  const featureNote = feature ? ((await getNotesFor([feature.id])).get(feature.id) ?? null) : null
  const parent = typeof subject.parent === 'object' ? (subject.parent as Subject | null) : null

  return { subject, parent, children, shelves, feature, featureNote, total: total.totalDocs }
}

export const getArticles = async (limit = 12, page = 1) => {
  const payload = await client()
  return payload.find({
    collection: 'articles',
    where: PUBLISHED,
    depth: 1,
    limit,
    page,
    sort: '-publishedAt',
    select: { title: true, slug: true, kind: true, standfirst: true, publishedAt: true, byline: true, image: true, books: true },
  })
}

export const getArticle = cache(async (slug: string) => {
  const payload = await client()
  const found = await payload.find({
    collection: 'articles',
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    depth: 1,
    limit: 1,
  })
  return found.docs[0] ?? null
})

export const getPage = cache(async (slug: string) => {
  const payload = await client()
  const found = await payload.find({
    collection: 'pages',
    where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    depth: 2,
    limit: 1,
  })
  return found.docs[0] ?? null
})

export const getPreOrders = async () => (await findCards({ sourcing: { equals: 'pre_order' } }, 60, 'expectedDate')).docs
