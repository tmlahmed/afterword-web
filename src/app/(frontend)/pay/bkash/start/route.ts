import config from '@payload-config'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { bkashIsLive, startBkashPayment } from '../../../../../lib/payments/bkash'

/** GET /pay/bkash/start?t=<order token> — sends the customer to bKash to pay what is due now. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  if (!/^[a-f0-9]{36}$/.test(token)) redirect('/')
  const payload = await getPayload({ config })
  const order = (await payload.find({ collection: 'orders', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!order) redirect('/')
  let target = `/order/${token}?paid=0`
  if (bkashIsLive()) {
    try {
      target = await startBkashPayment(order)
    } catch (err) {
      payload.logger.error(`Could not start bKash payment for ${order.number}: ${err instanceof Error ? err.message : err}`)
    }
  }
  redirect(target)
}
