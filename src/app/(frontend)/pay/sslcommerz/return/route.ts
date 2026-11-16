import config from '@payload-config'
import { getPayload } from 'payload'

import { siteUrl } from '../../../../../lib/notify'
import { settlePayment } from '../../../../../lib/payments/sslcommerz'

/** Where SSLCommerz sends the customer back after paying, failing or cancelling. */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const form = await request.formData().catch(() => null)
  const valId = String(form?.get('val_id') ?? '')
  let paid = false
  if (valId) {
    const payload = await getPayload({ config })
    paid = (await settlePayment(payload, valId).catch(() => ({ ok: false }))).ok
  }
  return Response.redirect(`${siteUrl()}/order/${/^[a-f0-9]{36}$/.test(token) ? token : ''}?${paid ? 'placed=1' : 'paid=0'}`, 303)
}
