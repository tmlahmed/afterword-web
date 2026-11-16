import config from '@payload-config'
import { getPayload } from 'payload'

import { buildFeed } from '../../../../lib/feeds'

/** GET /feeds/google.xml — the catalogue for Google Merchant Center. */
export async function GET() {
  const { xml } = await buildFeed(await getPayload({ config }), 'google')
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
