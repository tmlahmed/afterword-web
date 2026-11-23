import config from '@payload-config'
import { getPayload } from 'payload'

import { copiesInLots, estimateCost } from '../lib/lots'

/**
 * Gives every book's copies a stock lot, and checks that the lots and the stock ledger agree.
 * - Copies already on the shelf with no lot (stock from before lots existed) get one
 *   "opening" lot, its cost estimated from the printed price and marked as an estimate.
 * - Any book whose lots hold more copies than the ledger says is listed for a person to look at.
 * Safe to run again: books already covered are left alone. Run once after deploying lots:
 *   pnpm stock:lots
 */
const payload = await getPayload({ config })
const pricing = await payload.findGlobal({ slug: 'pricing', depth: 0, overrideAccess: true })
const books = await payload.find({
  collection: 'editions',
  where: { stockOnHand: { greater_than: 0 } },
  depth: 0,
  pagination: false,
  overrideAccess: true,
  select: { title: true, stockOnHand: true, listPrice: true, listCurrency: true, price: true },
})

let created = 0
let copies = 0
for (const b of books.docs) {
  const inLots = await copiesInLots(payload, b.id)
  const missing = (b.stockOnHand ?? 0) - inLots
  if (missing <= 0) continue
  const first = await payload.find({
    collection: 'stock-movements',
    where: { and: [{ edition: { equals: b.id } }, { quantity: { greater_than: 0 } }] },
    sort: 'createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'stock-lots',
    data: {
      edition: b.id,
      quantity: missing,
      remaining: missing,
      receivedAt: first.docs[0]?.createdAt ?? new Date().toISOString(),
      listPrice: b.listPrice,
      listCurrency: b.listCurrency,
      landedCost: estimateCost(b, pricing),
      estimated: true,
      note: 'Opening stock (cost estimated)',
    },
    depth: 0,
    overrideAccess: true,
  })
  created++
  copies += missing
}

// Estimated lots still without a cost (no exchange rate was set when they were made).
const uncosted = await payload.find({ collection: 'stock-lots', where: { and: [{ estimated: { equals: true } }, { landedCost: { exists: false } }] }, depth: 0, pagination: false, overrideAccess: true })
let costed = 0
for (const lot of uncosted.docs) {
  const cost = estimateCost({ listPrice: lot.listPrice, listCurrency: lot.listCurrency, price: null }, pricing)
  if (cost === null) continue
  await payload.update({ collection: 'stock-lots', id: lot.id, data: { landedCost: cost }, depth: 0, overrideAccess: true })
  costed++
}
if (costed) console.log(`Estimated costs filled in for ${costed} ${costed === 1 ? 'lot' : 'lots'}.`)

// Every book with lots: do they hold exactly what the ledger says is on the shelf?
const all = await payload.find({ collection: 'editions', depth: 0, pagination: false, overrideAccess: true, select: { title: true, stockOnHand: true } })
const wrong: string[] = []
for (const b of all.docs) {
  const inLots = await copiesInLots(payload, b.id)
  if (inLots !== (b.stockOnHand ?? 0)) wrong.push(`${b.title} (#${b.id}): ${b.stockOnHand ?? 0} on the shelf, ${inLots} in lots`)
}

console.log(`Opening lots: ${created} ${created === 1 ? 'book' : 'books'}, ${copies} ${copies === 1 ? 'copy' : 'copies'}.`)
console.log(wrong.length ? `Lots that do not match the shelf:\n  ${wrong.join('\n  ')}` : 'Every book’s lots match its stock.')
process.exit(wrong.length ? 1 : 0)
