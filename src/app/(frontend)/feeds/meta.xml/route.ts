import config from '@payload-config'
import { getPayload } from 'payload'

import { buildFeed } from '../../../../lib/feeds'

/** GET /feeds/meta.xml — the catalogue for Meta Commerce Manager (Facebook and Instagram Shops). */
export async function GET() {
  const { xml } = await buildFeed(await getPayload({ config }), 'meta')
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
