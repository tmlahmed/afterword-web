import config from '@payload-config'
import { after } from 'next/server'
import { getPayload } from 'payload'

import { syncPathao } from '../../../../lib/courier'
import { pathaoMode } from '../../../../lib/courier/pathao'

/**
 * Pathao's webhook: POST /courier/pathao. Set this address in the Pathao merchant panel
 * (Developer's API → Webhook) once the shop is live.
 *
 * We never trust what the call says. It only tells us which parcel to look at; the status is
 * then read back from Pathao's own API. So a forged call can at most make us check a parcel.
 * PATHAO_WEBHOOK_SECRET, when set, must match the secret Pathao sends in X-PATHAO-Signature.
 * PATHAO_WEBHOOK_REPLY, when set, is returned in X-Pathao-Merchant-Webhook-Integration-Secret,
 * which Pathao asks for when the webhook is first added.
 */
export async function POST(request: Request) {
  const headers = new Headers()
  if (process.env.PATHAO_WEBHOOK_REPLY) headers.set('X-Pathao-Merchant-Webhook-Integration-Secret', process.env.PATHAO_WEBHOOK_REPLY)
  const reply = (body: object, status = 202) => Response.json(body, { status, headers })

  const secret = process.env.PATHAO_WEBHOOK_SECRET
  if (secret && request.headers.get('x-pathao-signature') !== secret) return reply({ ok: false }, 401)
  if (pathaoMode() === 'off') return reply({ ok: true, ignored: 'not connected' })

  const body = (await request.json().catch(() => ({}))) as { consignment_id?: unknown; event?: unknown }
  const consignment = typeof body.consignment_id === 'string' ? body.consignment_id.trim() : ''
  // Pathao's test call when the webhook is added has no parcel in it.
  if (!/^[A-Za-z0-9-]{4,40}$/.test(consignment)) return reply({ ok: true })

  // Answer straight away; asking Pathao about the parcel happens after the reply is sent.
  after(async () => {
    const payload = await getPayload({ config })
    const result = await syncPathao(payload, consignment)
    if (result.problems.length) payload.logger.warn(`Pathao webhook ${consignment}: ${result.problems.join('; ')}`)
  })
  return reply({ ok: true })
}
