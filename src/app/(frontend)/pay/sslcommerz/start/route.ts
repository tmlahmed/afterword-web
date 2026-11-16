import config from '@payload-config'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { gatewayIsLive, startPayment } from '../../../../../lib/payments/sslcommerz'

/** GET /pay/sslcommerz/start?t=<order token> — sends the customer to the payment page for what is due now. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const payload = await getPayload({ config })
  const order = (await payload.find({ collection: 'orders', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!order) redirect('/')
  let target = `/order/${token}?paid=0`
  if (gatewayIsLive()) {
    try {
      target = await startPayment(order)
    } catch (err) {
      payload.logger.error(`Could not start payment for ${order.number}: ${err instanceof Error ? err.message : err}`)
    }
  }
  redirect(target)
}
