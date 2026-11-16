import { suggest } from '../../../lib/search'

/** GET /suggest?q=… — quick matches for the search box. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return Response.json({ hits: [] })
  try {
    return Response.json({ hits: await suggest(q) }, { headers: { 'Cache-Control': 'public, max-age=30' } })
  } catch {
    return Response.json({ hits: [] })
  }
}
