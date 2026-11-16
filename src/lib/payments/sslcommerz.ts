import 'server-only'

import type { Payload } from 'payload'

import type { Order } from '../../payload-types'
import { siteUrl } from '../notify'
import { runOrderAction } from '../orders/transitions'

/**
 * SSLCommerz hosted checkout (cards, bKash and other wallets, internet banking).
 * Written from SSLCommerz's developer guide (v4). It switches on when SSLCZ_STORE_ID and
 * SSLCZ_STORE_PASSWORD are set, and uses the sandbox unless SSLCZ_LIVE=true.
 * NOT YET TESTED against the sandbox — that needs store credentials.
 */
const base = () => (process.env.SSLCZ_LIVE === 'true' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com')
const creds = () => ({ store_id: process.env.SSLCZ_STORE_ID ?? '', store_passwd: process.env.SSLCZ_STORE_PASSWORD ?? '' })

export const gatewayIsLive = (): boolean => Boolean(process.env.SSLCZ_STORE_ID && process.env.SSLCZ_STORE_PASSWORD)

/** Start a payment for what is due now on an order. Returns the address to send the customer to. */
export const startPayment = async (order: Order): Promise<string> => {
  const due = Math.max(0, (order.payNow ?? 0) - (order.paid ?? 0))
  if (due <= 0) throw new Error('Nothing is due on this order.')
  const site = siteUrl()
  const body = new URLSearchParams({
    ...creds(),
    total_amount: String(due),
    currency: 'BDT',
    // Unique per attempt, and traceable back to the order.
    tran_id: `${order.number}-${Date.now().toString(36)}`,
    success_url: `${site}/pay/sslcommerz/return?t=${order.token}`,
    fail_url: `${site}/pay/sslcommerz/return?t=${order.token}`,
    cancel_url: `${site}/pay/sslcommerz/return?t=${order.token}`,
    ipn_url: `${site}/pay/sslcommerz/ipn`,
    value_a: String(order.id),
    cus_name: order.contactName,
    cus_email: order.contactEmail || 'customer@afterword.invalid',
    cus_phone: order.contactPhone,
    cus_add1: order.street,
    cus_city: order.district,
    cus_country: 'Bangladesh',
    shipping_method: 'Courier',
    ship_name: order.contactName,
    ship_add1: order.street,
    ship_city: order.district,
    ship_postcode: '0000',
    ship_country: 'Bangladesh',
    product_name: `Books, order ${order.number}`,
    product_category: 'Books',
    product_profile: 'physical-goods',
  })
  const res = await fetch(`${base()}/gwprocess/v4/api.php`, { method: 'POST', body, signal: AbortSignal.timeout(20000) })
  const data = (await res.json()) as { status?: string; GatewayPageURL?: string; failedreason?: string }
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) throw new Error(data.failedreason || 'The payment page could not be opened.')
  return data.GatewayPageURL
}

/**
 * Confirm a payment with SSLCommerz, server to server, and record it on the order.
 * Never trusts what the browser says: the amount and order are read from SSLCommerz's own answer.
 * Safe to call twice for the same payment (the return page and the IPN both call it).
 */
export const settlePayment = async (payload: Payload, valId: string): Promise<{ ok: boolean; orderId?: number }> => {
  const query = new URLSearchParams({ val_id: valId, ...creds(), format: 'json' })
  const res = await fetch(`${base()}/validator/api/validationserverAPI.php?${query}`, { signal: AbortSignal.timeout(20000) })
  const data = (await res.json()) as { status?: string; amount?: string; currency_type?: string; value_a?: string; bank_tran_id?: string; card_type?: string }
  if (!['VALID', 'VALIDATED'].includes(data.status ?? '')) return { ok: false }

  const orderId = Number(data.value_a)
  const amount = Math.round(Number(data.amount))
  const reference = data.bank_tran_id ?? valId
  if (!orderId || !amount || data.currency_type !== 'BDT') return { ok: false }

  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order) return { ok: false }
  if ((order.payments ?? []).some((p) => p.reference === reference)) return { ok: true, orderId } // already recorded
  await runOrderAction(payload, orderId, { action: 'record_payment', amount, method: data.card_type || 'SSLCommerz', reference }, 'Online payment')
  return { ok: true, orderId }
}
