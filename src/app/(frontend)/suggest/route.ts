import config from '@payload-config'
import { getPayload } from 'payload'

import { availabilityOf } from '../../../lib/availability'
import { normaliseIsbn } from '../../../lib/isbn/isbn'
import { suggest } from '../../../lib/search'

/**
 * Quick matches from the database, used when the search engine is not running.
 * Plainer than the search engine (no typo tolerance), but the box always answers.
 */
const suggestFromDatabase = async (q: string) => {
  const payload = await getPayload({ config })
  const isbn = normaliseIsbn(q)
  const found = await payload.find({
    collection: 'editions',
    where: {
      and: [
        { status: { equals: 'published' } },
        isbn ? { isbn13: { equals: isbn } } : { or: [{ title: { like: q } }, { authorLine: { like: q } }] },
      ],
    },
    select: { title: true, slug: true, authorLine: true, coverUrl: true, price: true, sourcing: true, stockOnHand: true, expectedDate: true, leadTimeWeeks: true },
    sort: 'title',
    limit: 6,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.map((b) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    authorLine: b.authorLine,
    coverUrl: b.coverUrl,
    price: b.price,
    state: availabilityOf(b).state,
  }))
}

/** GET /suggest?q=… — quick matches for the search box. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return Response.json({ hits: [] })
  try {
    return Response.json({ hits: await suggest(q) }, { headers: { 'Cache-Control': 'public, max-age=30' } })
  } catch {
    try {
      return Response.json({ hits: await suggestFromDatabase(q) }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return Response.json({ hits: [] })
    }
  }
}
