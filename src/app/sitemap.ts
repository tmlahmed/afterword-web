import config from '@payload-config'
import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'

import { siteUrl } from '../lib/notify'

/**
 * Sitemaps for search engines: /sitemap/0.xml has every page except books;
 * /sitemap/1.xml onwards list the books, 20,000 to a file. robots.txt lists them all.
 */
export const BOOKS_PER_SITEMAP = 20000

// Rebuilt at most once an hour as books are added.
export const revalidate = 3600

export async function generateSitemaps() {
  const payload = await getPayload({ config })
  const { totalDocs } = await payload.count({ collection: 'editions', where: { status: { equals: 'published' } } })
  const bookFiles = Math.max(1, Math.ceil(totalDocs / BOOKS_PER_SITEMAP))
  return Array.from({ length: bookFiles + 1 }, (_, id) => ({ id }))
}

const idOf = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : typeof v === 'object' && v !== null && 'id' in v ? Number((v as { id: number }).id) : undefined

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)
  const base = siteUrl()
  const payload = await getPayload({ config })
  const published = { status: { equals: 'published' } } as const

  if (id > 0) {
    const books = await payload.find({
      collection: 'editions',
      where: published,
      select: { slug: true, updatedAt: true },
      sort: 'id',
      depth: 0,
      limit: BOOKS_PER_SITEMAP,
      page: id,
    })
    return books.docs.map((b) => ({ url: `${base}/book/${b.slug}`, lastModified: b.updatedAt, changeFrequency: 'weekly', priority: 0.8 }))
  }

  // Authors, series and publishers only appear when they have a book in the shop.
  const shelf = await payload.find({
    collection: 'editions',
    where: published,
    select: { contributors: true, series: true, publisher: true },
    depth: 0,
    pagination: false,
  })
  const people = new Set<number>()
  const series = new Set<number>()
  const publishers = new Set<number>()
  for (const b of shelf.docs) {
    for (const c of b.contributors ?? []) if (c.role === 'author') people.add(idOf(c.contributor)!)
    if (idOf(b.series)) series.add(idOf(b.series)!)
    if (idOf(b.publisher)) publishers.add(idOf(b.publisher)!)
  }

  const slugsOf = async (collection: 'contributors' | 'series' | 'publishers', ids: Set<number>) =>
    ids.size
      ? (await payload.find({ collection, where: { id: { in: [...ids] } }, select: { slug: true, updatedAt: true }, depth: 0, pagination: false })).docs
      : []

  const [subjects, lists, articles, pages, authorDocs, seriesDocs, publisherDocs] = await Promise.all([
    payload.find({ collection: 'subjects', select: { slug: true, updatedAt: true }, depth: 0, pagination: false }),
    payload.find({ collection: 'lists', select: { slug: true, updatedAt: true }, depth: 0, pagination: false }),
    payload.find({ collection: 'articles', where: published, select: { slug: true, updatedAt: true }, depth: 0, pagination: false }),
    payload.find({ collection: 'pages', where: published, select: { slug: true, updatedAt: true }, depth: 0, pagination: false }),
    slugsOf('contributors', people),
    slugsOf('series', series),
    slugsOf('publishers', publishers),
  ])

  type Entry = MetadataRoute.Sitemap[number]
  const entry = (path: string, lastModified?: string, priority = 0.5): Entry => ({ url: `${base}${path}`, lastModified, priority })

  return [
    entry('/', undefined, 1),
    entry('/marginalia', undefined, 0.6),
    entry('/collections', undefined, 0.6),
    entry('/pre-orders', undefined, 0.6),
    entry('/on-request', undefined, 0.5),
    ...subjects.docs.map((s) => entry(`/subjects/${s.slug}`, s.updatedAt, 0.7)),
    ...lists.docs.map((l) => entry(`/collections/${l.slug}`, l.updatedAt, 0.6)),
    ...articles.docs.map((a) => entry(`/marginalia/${a.slug}`, a.updatedAt, 0.6)),
    ...pages.docs.map((p) => entry(`/${p.slug}`, p.updatedAt, 0.3)),
    ...authorDocs.map((a) => entry(`/authors/${a.slug}`, a.updatedAt)),
    ...seriesDocs.map((s) => entry(`/series/${s.slug}`, s.updatedAt)),
    ...publisherDocs.map((p) => entry(`/publishers/${p.slug}`, p.updatedAt, 0.4)),
  ]
}
