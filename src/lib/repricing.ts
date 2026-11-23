import type { Payload, PayloadRequest } from 'payload'

import type { Edition, Pricing } from '../payload-types'
import { computePrice, derivePrices, effectiveDiscount } from './pricing'

const idsOf = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'object' && x !== null ? (x as { id: number }).id : (x as number))).filter((n) => typeof n === 'number') : []
const idOf = (v: unknown): number | null => (typeof v === 'object' && v !== null ? (v as { id: number }).id : typeof v === 'number' ? v : null)

/** A group discount that is running now, with the books its collections hold already looked up. */
export type GroupRule = { id: number; percent: number; subjects: Set<number>; publishers: Set<number>; editions: Set<number> }

/** The group discounts running at this moment. */
export const activeGroupDiscounts = async (payload: Payload, req?: Partial<PayloadRequest>, now = new Date()): Promise<GroupRule[]> => {
  const found = await payload.find({ collection: 'group-discounts', where: { active: { equals: true } }, depth: 0, pagination: false, overrideAccess: true, req })
  const running = found.docs.filter((g) => (!g.startsAt || new Date(g.startsAt) <= now) && (!g.endsAt || new Date(g.endsAt) > now))
  const listIds = [...new Set(running.flatMap((g) => idsOf(g.lists)))]
  const lists = listIds.length
    ? (await payload.find({ collection: 'lists', where: { id: { in: listIds } }, depth: 0, pagination: false, overrideAccess: true, req, select: { books: true } })).docs
    : []
  const booksOfList = new Map(lists.map((l) => [l.id, idsOf(l.books)]))
  // A subject covers its sub-subjects too: "Gifts & Stationery" includes Bookmarks.
  const subjectRows = running.some((g) => idsOf(g.subjects).length)
    ? (await payload.find({ collection: 'subjects', depth: 0, pagination: false, overrideAccess: true, req, select: { parent: true } })).docs
    : []
  const withChildren = (ids: number[]) => {
    const all = new Set(ids)
    for (let grew = true; grew; ) {
      grew = false
      for (const s of subjectRows) {
        const parent = idOf(s.parent)
        if (parent !== null && all.has(parent) && !all.has(s.id)) {
          all.add(s.id)
          grew = true
        }
      }
    }
    return all
  }
  return running.map((g) => ({
    id: g.id,
    percent: g.percent,
    subjects: withChildren(idsOf(g.subjects)),
    publishers: new Set(idsOf(g.publishers)),
    editions: new Set([...idsOf(g.books), ...idsOf(g.lists).flatMap((l) => booksOfList.get(l) ?? [])]),
  }))
}

/** The biggest running group discount that covers this book, or 0. */
export const groupDiscountFor = (book: { id?: number | null; subjects?: unknown; publisher?: unknown }, rules: GroupRule[]): number => {
  const subjects = idsOf(book.subjects)
  const publisher = idOf(book.publisher)
  let best = 0
  for (const r of rules) {
    const covers = (book.id && r.editions.has(book.id)) || (publisher !== null && r.publishers.has(publisher)) || subjects.some((s) => r.subjects.has(s))
    if (covers && r.percent > best) best = r.percent
  }
  return best
}

type PricedFields = Pick<Edition, 'kind' | 'listPrice' | 'listCurrency' | 'priceOverride' | 'discount' | 'price'>

/**
 * The prices a book should have under the pricing rules: its listed price, what customers pay
 * and what is shown struck through. Gifts and stationery get only a discount set on them or a
 * group discount, never the shop's default.
 */
export const pricesFor = (book: PricedFields, pricing: Pricing, sale: number) => {
  const original = computePrice(book.listPrice, book.listCurrency, {
    rates: (pricing.rates ?? []).map((r) => ({ currency: r.currency, rate: r.rate })),
    margin: pricing.defaultMargin ?? 1,
    roundTo: pricing.roundTo ?? 10,
  })
  const shop = book.kind === 'item' ? 0 : pricing.defaultDiscount
  const discount = effectiveDiscount(book.discount, shop, sale)
  const { price, compareAtPrice } = derivePrices(original, book.priceOverride, book.price, discount, pricing.roundTo ?? 10)
  return { originalPrice: original, price, compareAtPrice, saleDiscount: sale || null }
}

/**
 * Brings every book's price in line with the pricing rules and the group discounts running now.
 * Only books whose price would change are saved. Run after the rules or a group discount
 * change, and every quarter of an hour so sales start and end on time.
 */
export const repriceAll = async (payload: Payload): Promise<number> => {
  const [pricing, rules] = await Promise.all([payload.findGlobal({ slug: 'pricing', depth: 0, overrideAccess: true }), activeGroupDiscounts(payload)])
  const books = await payload.find({
    collection: 'editions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { kind: true, subjects: true, publisher: true, listPrice: true, listCurrency: true, priceOverride: true, discount: true, saleDiscount: true, price: true, compareAtPrice: true, originalPrice: true },
  })
  let changed = 0
  for (const b of books.docs) {
    const next = pricesFor(b, pricing, groupDiscountFor(b, rules))
    const same =
      (next.price ?? null) === (b.price ?? null) &&
      (next.compareAtPrice ?? null) === (b.compareAtPrice ?? null) &&
      (next.originalPrice ?? null) === (b.originalPrice ?? null) &&
      (next.saleDiscount ?? null) === (b.saleDiscount ?? null)
    if (same) continue
    // The book's own save works the prices out again, the same way, and updates search.
    await payload.update({ collection: 'editions', id: b.id, data: {}, depth: 0, overrideAccess: true })
    changed++
  }
  return changed
}

let pending: ReturnType<typeof setTimeout> | null = null
/** Re-price everything shortly, once, however many changes ask for it in a row. */
export const scheduleReprice = (payload: Payload, why: string) => {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    repriceAll(payload)
      .then((n) => n && payload.logger.info(`Re-priced ${n} ${n === 1 ? 'book' : 'books'} (${why}).`))
      .catch((err) => payload.logger.error(`Re-pricing failed: ${err instanceof Error ? err.message : err}`))
  }, 1500)
}
