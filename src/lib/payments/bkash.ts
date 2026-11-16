import 'server-only'

import type { Payload } from 'payload'

import type { Order } from '../../payload-types'
import { siteUrl } from '../notify'
import { runOrderAction } from '../orders/transitions'

/**
 * bKash Tokenized Checkout, direct with bKash (no gateway in between, lower fees than paying
 * bKash through SSLCommerz). Written from bKash's Tokenized Checkout API (v1.2.0-beta):
 * grant token → create payment → customer approves in bKash → execute payment.
 *
 * Switches on when BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME and BKASH_PASSWORD are set.
 * Uses the bKash sandbox unless BKASH_LIVE=true.
 * NOT YET TESTED end to end — that needs merchant sandbox credentials from bKash.
 */
const base = () =>
  process.env.BKASH_LIVE === 'true' ? 'https://tokenized.pay.bka.sh/v1.2.0-beta' : 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'

export const bkashIsLive = (): boolean =>
  Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET && process.env.BKASH_USERNAME && process.env.BKASH_PASSWORD)

// The grant token lasts an hour; keep it and ask again a little before it runs out.
type Grant = { token: string; expires: number }
const grant: { current?: Grant } = ((globalThis as { __awBkash?: { current?: Grant } }).__awBkash ??= {})

const token = async (): Promise<string> => {
  if (grant.current && grant.current.expires > Date.now() + 60_000) return grant.current.token
  const res = await fetch(`${base()}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      username: process.env.BKASH_USERNAME ?? '',
      password: process.env.BKASH_PASSWORD ?? '',
    },
    body: JSON.stringify({ app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET }),
    signal: AbortSignal.timeout(20000),
  })
  const data = (await res.json()) as { id_token?: string; expires_in?: number | string; statusMessage?: string }
  if (!data.id_token) throw new Error(`bKash refused the sign-in: ${data.statusMessage ?? res.status}`)
  grant.current = { token: data.id_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 }
  return data.id_token
}

const call = async <T>(path: string, body: Record<string, string>): Promise<T> => {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: await token(),
      'X-APP-Key': process.env.BKASH_APP_KEY ?? '',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  return (await res.json()) as T
}

/** Start a bKash payment for what is due now. Returns the bKash page to send the customer to. */
export const startBkashPayment = async (order: Order): Promise<string> => {
  const due = Math.max(0, (order.payNow ?? 0) - (order.paid ?? 0))
  if (due <= 0) throw new Error('Nothing is due on this order.')
  const data = await call<{ paymentID?: string; bkashURL?: string; statusCode?: string; statusMessage?: string }>('/tokenized/checkout/create', {
    mode: '0011',
    payerReference: order.contactPhone.replace(/^\+88/, ''),
    callbackURL: `${siteUrl()}/pay/bkash/callback?t=${order.token}`,
    amount: due.toFixed(2),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber: `${order.number}-${Date.now().toString(36)}`,
  })
  if (data.statusCode !== '0000' || !data.bkashURL) throw new Error(data.statusMessage || 'bKash could not start the payment.')
  return data.bkashURL
}

/**
 * Finish a payment the customer approved in bKash, and record it on the order.
 * The amount is taken from bKash's answer, never from the browser. Safe to call twice:
 * a payment already recorded (same bKash transaction ID) is not recorded again.
 */
export const finishBkashPayment = async (payload: Payload, order: Order, paymentID: string): Promise<{ ok: boolean; message?: string }> => {
  type Result = { statusCode?: string; statusMessage?: string; transactionStatus?: string; trxID?: string; amount?: string; currency?: string; merchantInvoiceNumber?: string }
  let result = await call<Result>('/tokenized/checkout/execute', { paymentID })
  // If execute timed out or was already done, ask bKash where the payment stands.
  if (result.transactionStatus !== 'Completed') result = await call<Result>('/tokenized/checkout/payment/status', { paymentID })
  if (result.transactionStatus !== 'Completed' || !result.trxID) return { ok: false, message: result.statusMessage }
  if (!result.merchantInvoiceNumber?.startsWith(`${order.number}-`) || result.currency !== 'BDT') return { ok: false, message: 'Payment does not match this order.' }

  const amount = Math.round(Number(result.amount))
  if ((order.payments ?? []).some((p) => p.reference === result.trxID)) return { ok: true }
  await runOrderAction(payload, order.id, { action: 'record_payment', amount, method: 'bKash', reference: result.trxID }, 'Online payment')
  return { ok: true }
}

// Refunds are made from the bKash merchant panel for now; see docs/runbook.md.
