import type { Endpoint } from 'payload'

/** GET /api/health — for uptime monitors. 200 when the database answers; reports search separately. */
export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: async (req) => {
    let database = false
    let search = false
    try {
      await req.payload.count({ collection: 'subjects', overrideAccess: true })
      database = true
    } catch {}
    try {
      const res = await fetch(`${process.env.MEILI_URL || 'http://127.0.0.1:7700'}/health`, { signal: AbortSignal.timeout(3000) })
      search = res.ok
    } catch {}
    return Response.json({ ok: database, database, search }, { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
  },
}
