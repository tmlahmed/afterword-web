/**
 * Loads the sample catalogue into the database.
 *
 *   pnpm seed
 *
 * Safe to run more than once: books already in the catalogue are left alone.
 * Book data and covers are real (from Open Library and Google Books).
 * List prices, exchange rates and stock levels are SAMPLE VALUES for the staging site.
 */
import { getPayload } from 'payload'

import { importBook } from '../lib/isbn/importBook'
import { isbn10to13, isValidIsbn13 } from '../lib/isbn/isbn'
import { type BookRecord, getJson, googleBooks } from '../lib/isbn/sources'
import config from '../payload.config'
import { LISTS, SAMPLE_NOTES, type SeedTitle, SUBJECTS, TITLES } from './titles'

type SearchEdition = {
  isbn?: string[]
  cover_i?: number
  publisher?: string[]
  publish_date?: string[]
  language?: string[]
}
type SearchDoc = {
  key: string
  title: string
  isbn?: string[]
  first_publish_year?: number
  number_of_pages_median?: number
  cover_i?: number
  editions?: { docs?: SearchEdition[] }
}

// Open Library allows about one request a second from clients that do not send a contact
// address. Requests to it are queued and spaced out; going faster gets every request refused.
let lastCall = Promise.resolve()
const politely = <T>(fn: () => Promise<T>): Promise<T> => {
  const result = lastCall.then(fn)
  lastCall = result.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    () => new Promise<void>((resolve) => setTimeout(resolve, 1200)),
  )
  return result
}

/**
 * Find a real English-language edition of a title on Open Library. One request per book:
 * the search result already carries the edition's ISBN, cover, publisher and date.
 */
const findEdition = async (t: SeedTitle): Promise<BookRecord | null> => {
  const params = new URLSearchParams({
    // A general query, not title= and author=: translated books are filed under their
    // original-language title, and only the general query matches their English editions.
    q: `${t.title} ${t.author}`,
    lang: 'en',
    limit: '1',
    fields:
      'key,title,first_publish_year,number_of_pages_median,cover_i,isbn,editions,editions.isbn,editions.cover_i,editions.publisher,editions.publish_date,editions.language',
  })
  const res = await politely(() => getJson<{ docs: SearchDoc[] }>(`https://openlibrary.org/search.json?${params}`))
  const doc = res?.docs?.[0]
  if (!doc) return null
  const edition = doc.editions?.docs?.[0]
  // Prefer the best-matching English edition; fall back to any English-market edition of the work.
  const matched = edition?.isbn ?? []
  const isbns = matched.length ? matched : (doc.isbn ?? []).filter((i) => /^97[89][01]/.test(i))
  const isbn13 = isbns.find((i) => i.length === 13 && isValidIsbn13(i))
  const isbn10 = isbns.find((i) => i.length === 10)
  const isbn = isbn13 ?? (isbn10 ? isbn10to13(isbn10) : undefined)
  if (!isbn) return null
  const cover = edition?.cover_i ?? doc.cover_i
  const year = edition?.publish_date?.[0]?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]
  return {
    isbn13: isbn,
    title: t.title,
    workTitle: t.title,
    workKey: `openlibrary:${doc.key}`,
    firstPublished: doc.first_publish_year,
    contributors: [{ name: t.author, role: 'author' }],
    publisher: edition?.publisher?.[0],
    published: year,
    pages: doc.number_of_pages_median,
    coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : undefined,
    source: 'Open Library',
  }
}

let googleIsUp = true
let googleMisses = 0

/** The description on an Open Library work record, tidied. One spaced request. */
const workSynopsis = async (workKey?: string): Promise<string | undefined> => {
  const key = workKey?.replace('openlibrary:', '')
  if (!key) return undefined
  const work = await politely(() => getJson<{ description?: string | { value?: string } }>(`https://openlibrary.org${key}.json`))
  const raw = typeof work?.description === 'string' ? work.description : work?.description?.value
  return (
    raw
      ?.replace(/\r/g, '')
      .replace(/\(\[?source\]?[\s\S]*$/i, '')
      .replace(/-{3,}[\s\S]*$/, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\*{1,3}|_{2,3}/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || undefined
  )
}

// Sample list prices in pounds by kind of book. Not real prices.
const samplePrice = (subject: string, index: number): number => {
  if (subject === 'picture-books') return 7.99
  if (['middle-grade', 'young-adult'].includes(subject)) return 8.99
  if (subject === 'classics') return [7.99, 8.99, 9.99][index % 3]
  if (['history-politics', 'science-nature', 'arts-writing'].includes(subject)) return [10.99, 12.99, 14.99][index % 3]
  if (subject === 'graphic-novels') return 14.99
  return [9.99, 9.99, 10.99, 8.99][index % 4]
}

const run = async () => {
  const payload = await getPayload({ config })
  const log = (msg: string) => payload.logger.info(msg)

  // 1. Pricing rules (sample rates) — only if none are set yet.
  const pricing = await payload.findGlobal({ slug: 'pricing' })
  if (!pricing.rates?.length) {
    await payload.updateGlobal({
      slug: 'pricing',
      data: {
        rates: [
          { currency: 'GBP', rate: 165 },
          { currency: 'USD', rate: 123 },
          { currency: 'INR', rate: 1.45 },
          { currency: 'EUR', rate: 140 },
        ],
        defaultMargin: 1,
        roundTo: 10,
      },
    })
    log('Pricing rules: sample rates set')
  }

  // 2. Subjects (two levels).
  const subjectIds = new Map<string, number>()
  for (const s of SUBJECTS) {
    const found = await payload.find({ collection: 'subjects', where: { slug: { equals: s.slug } }, limit: 1, depth: 0 })
    const parent = s.parent ? subjectIds.get(s.parent) : undefined
    const doc =
      found.docs[0] ??
      (await payload.create({ collection: 'subjects', data: { name: s.name, slug: s.slug, parent }, depth: 0 }))
    subjectIds.set(s.slug, doc.id)
  }
  log(`Subjects: ${subjectIds.size}`)

  // 3. Books — resolve each title to a real edition, then import it.
  const listMembers = new Map<string, number[]>()
  const idByTitle = new Map<string, number>()
  let created = 0
  let skipped = 0

  const importOne = async (t: SeedTitle, index: number) => {
    // Already loaded on an earlier run? Reuse it rather than importing a second edition.
    const already = await payload.find({
      collection: 'editions',
      where: { and: [{ title: { equals: t.title } }, { authorLine: { equals: t.author } }] },
      limit: 1,
      depth: 0,
    })
    let edition = already.docs[0]
    let isNew = false

    if (!edition) {
      const found = await findEdition(t)
      if (!found) {
        skipped++
        log(`  – not found: ${t.title}`)
        return
      }
      // Synopsis: Google Books when it answers, otherwise the Open Library work record.
      const google = googleIsUp ? await googleBooks.lookup(found.isbn13) : null
      if (google) googleMisses = 0
      else if (++googleMisses >= 3) googleIsUp = false // rate-limited: stop asking for this run
      const synopsis = google?.synopsis ?? (await workSynopsis(found.workKey))
      const result = await importBook(payload, found.isbn13, {
        prefetched: {
          ...found,
          synopsis,
          pages: google?.pages ?? found.pages,
          subtitle: google?.subtitle,
          source: google ? 'Open Library + Google Books' : 'Open Library',
        },
        extra: {
          subjects: [subjectIds.get(t.subject)!],
          listPrice: samplePrice(t.subject, index),
          listCurrency: 'GBP',
          status: 'published',
        },
      })
      if (!result.ok) {
        skipped++
        log(`  – ${result.message}`)
        return
      }
      edition = result.edition
      isNew = result.created
    }

    idByTitle.set(t.title, edition.id)
    for (const slug of t.lists ?? []) listMembers.set(slug, [...(listMembers.get(slug) ?? []), edition.id])
    if (isNew) {
      created++
      const inStock = index % 9 < 5 // a little over half the range held in Dhaka
      if (inStock) {
        await payload.create({
          collection: 'stock-movements',
          data: { edition: edition.id, quantity: 2 + (index % 5), reason: 'opening', note: 'Sample opening stock' },
          depth: 0,
        })
      }
    }
  }

  const queue = TITLES.map((t, i) => [t, i] as const)
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await importOne(next[0], next[1])
      } catch (err) {
        skipped++
        log(`  – failed: ${next[0].title} (${err instanceof Error ? err.message : String(err)})`)
      }
      const done = TITLES.length - queue.length
      if (done % 20 === 0) log(`  ${done}/${TITLES.length} titles processed`)
    }
  }
  await worker()
  log(`Books: ${created} added, ${idByTitle.size - created} already present, ${skipped} skipped`)

  // 3b. Fill in synopses that were missed on an earlier run.
  const missing = await payload.find({
    collection: 'editions',
    where: { synopsis: { exists: false } },
    depth: 1,
    pagination: false,
  })
  let filled = 0
  for (const book of missing.docs) {
    const work = typeof book.work === 'object' ? book.work : null
    const synopsis = await workSynopsis(work?.sourceKey ?? undefined)
    if (!synopsis) continue
    await payload.update({ collection: 'editions', id: book.id, data: { synopsis }, depth: 0 })
    filled++
  }
  if (missing.docs.length) log(`Synopses: ${filled} of ${missing.docs.length} missing ones filled in`)

  // 4. Collections.
  const listIds = new Map<string, number>()
  for (const l of LISTS) {
    const books = listMembers.get(l.slug) ?? []
    const found = await payload.find({ collection: 'lists', where: { slug: { equals: l.slug } }, limit: 1, depth: 0 })
    const doc = found.docs[0]
      ? await payload.update({ collection: 'lists', id: found.docs[0].id, data: { books }, depth: 0 })
      : await payload.create({ collection: 'lists', data: { ...l, books }, depth: 0 })
    listIds.set(l.slug, doc.id)
  }
  log(`Collections: ${listIds.size}`)

  // 5. Sample bookseller notes.
  const noteByTitle = new Map<string, number>()
  for (const n of SAMPLE_NOTES) {
    const edition = idByTitle.get(n.title)
    if (!edition) continue
    const found = await payload.find({ collection: 'notes', where: { edition: { equals: edition } }, limit: 1, depth: 0 })
    const doc =
      found.docs[0] ??
      (await payload.create({
        collection: 'notes',
        data: { edition, body: n.body, signedBy: 'Sample note' },
        depth: 0,
      }))
    noteByTitle.set(n.title, doc.id)
  }
  log(`Bookseller notes: ${noteByTitle.size}`)

  // 6. Home page — only arranged if it has not been arranged yet.
  const home = await payload.findGlobal({ slug: 'home', depth: 0 })
  if (!home.shelves?.length) {
    const featured = ['A Golden Age', 'Small Things Like These', 'The Remains of the Day'].find((t) => idByTitle.has(t))
    const quoted = ['The Memory Police', 'Stoner', 'Piranesi'].find((t) => noteByTitle.has(t))
    const shelf = (title: string, intro: string, slug: string) => ({
      title,
      intro,
      source: 'list' as const,
      list: listIds.get(slug),
      limit: 12,
    })
    await payload.updateGlobal({
      slug: 'home',
      data: {
        feature: {
          eyebrow: 'Book of the Month',
          edition: featured ? idByTitle.get(featured) : undefined,
          note: featured ? noteByTitle.get(featured) : undefined,
        },
        shelves: [
          shelf('New & Notable', 'Recent books we keep pressing into people’s hands.', 'new-and-notable'),
          { title: 'In Stock Now', intro: 'On our shelves in Dhaka. Ordered today, sent tomorrow.', source: 'in_stock', limit: 12 },
          shelf('South Asian Voices', 'Novels from, and about, this part of the world.', 'south-asian-voices'),
          shelf('In Translation', 'The best of the world’s fiction, carried into English.', 'in-translation'),
          shelf('Modern Classics', 'Books that have already outlasted their decade.', 'modern-classics'),
          shelf('Big Ideas', 'History, science and argument for the curious.', 'big-ideas'),
          shelf('For Young Readers', 'First favourites, from picture books to young adult.', 'for-young-readers'),
        ],
        quote: quoted ? noteByTitle.get(quoted) : undefined,
      },
    })
    log('Home page: arranged')
  }

  log('Seed complete.')
  process.exit(0)
}

// Top-level await: `payload run` exits as soon as this module finishes loading.
try {
  await run()
} catch (err) {
  console.error(err)
  process.exit(1)
}
