import config from '@payload-config'
import { getPayload } from 'payload'

import { settlePayment } from '../../../../../lib/payments/sslcommerz'

/**
 * SSLCommerz's server-to-server notice. It arrives even if the customer closes their browser
 * before returning to the shop. The notice itself is not trusted: the payment is looked up
 * again with SSLCommerz before anything is recorded.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const valId = String(form?.get('val_id') ?? '')
  if (valId) {
    const payload = await getPayload({ config })
    await settlePayment(payload, valId).catch((err) => payload.logger.error(`IPN failed: ${err instanceof Error ? err.message : err}`))
  }
  return new Response('OK')
}
