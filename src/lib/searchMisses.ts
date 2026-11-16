import type { Payload } from 'payload'

/**
 * Remember searches that found nothing. These are books customers want that the shop does
 * not list — the best guide to what to bring in next. Shown under Reports.
 * Only the words searched are kept, never who searched.
 */
export const recordSearchMiss = (payload: Payload, raw: string): void => {
  const query = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
  if (query.length < 3) return
  void (async () => {
    try {
      const existing = await payload.find({ collection: 'search-misses', where: { query: { equals: query } }, limit: 1, depth: 0, overrideAccess: true })
      const now = new Date().toISOString()
      if (existing.docs[0]) {
        await payload.update({
          collection: 'search-misses',
          id: existing.docs[0].id,
          data: { count: (existing.docs[0].count ?? 0) + 1, lastAt: now },
          depth: 0,
          overrideAccess: true,
        })
      } else {
        await payload.create({ collection: 'search-misses', data: { query, count: 1, lastAt: now }, depth: 0, overrideAccess: true })
      }
    } catch {
      // Never let bookkeeping get in the way of a search.
    }
  })()
}
