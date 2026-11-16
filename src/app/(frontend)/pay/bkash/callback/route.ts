import config from '@payload-config'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { finishBkashPayment } from '../../../../../lib/payments/bkash'

/** Where bKash sends the customer back: ?t=<order token>&paymentID=…&status=success|failure|cancel */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t') ?? ''
  const paymentID = url.searchParams.get('paymentID') ?? ''
  if (!/^[a-f0-9]{36}$/.test(token)) redirect('/')
  let paid = false
  if (url.searchParams.get('status') === 'success' && paymentID) {
    const payload = await getPayload({ config })
    const order = (await payload.find({ collection: 'orders', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (order) {
      try {
        const result = await finishBkashPayment(payload, order, paymentID)
        paid = result.ok
        if (!result.ok) payload.logger.warn(`bKash payment for ${order.number} not completed: ${result.message ?? 'unknown'}`)
      } catch (err) {
        payload.logger.error(`bKash payment for ${order.number} could not be checked: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
  redirect(`/order/${token}?${paid ? 'placed=1' : 'paid=0'}`)
}
