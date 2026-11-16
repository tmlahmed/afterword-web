/**
 * Copy every book's imported cover into the shop's own image store.
 *   pnpm covers:copy
 * Safe to run again: books that already have a stored cover are skipped.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { storeCover } from '../lib/covers'

const payload = await getPayload({ config })
const books = await payload.find({
  collection: 'editions',
  where: { and: [{ cover: { exists: false } }, { coverUrl: { like: 'https://' } }] },
  select: { title: true },
  depth: 0,
  pagination: false,
})
console.log(`${books.docs.length} covers to copy.`)
const tally = { stored: 0, skipped: 0, failed: 0 }
for (const [i, b] of books.docs.entries()) {
  tally[await storeCover(payload, b.id)]++
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${books.docs.length}`)
  await new Promise((r) => setTimeout(r, 250)) // be gentle with the cover sites
}
console.log(`Done: ${tally.stored} copied, ${tally.failed} could not be fetched, ${tally.skipped} skipped.`)
process.exit(0)
