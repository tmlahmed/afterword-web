import 'server-only'

import { bkashIsLive } from './bkash'
import { gatewayIsLive } from './sslcommerz'

export type PayMethod = 'bkash' | 'sslcommerz' | 'bkash_manual'

/**
 * Ways a customer can pay now, best first: bKash direct (cheapest fees, most used),
 * then cards and other wallets through SSLCommerz, then bKash Send Money checked by hand.
 */
export const payMethods = (bkashNumber?: string | null): PayMethod[] => {
  const methods: PayMethod[] = []
  if (bkashIsLive()) methods.push('bkash')
  if (gatewayIsLive()) methods.push('sslcommerz')
  // Send Money is offered only when neither online way to pay bKash is connected.
  if (!bkashIsLive() && bkashNumber) methods.push('bkash_manual')
  return methods
}

/** Where to send the customer after placing an order that needs paying now. */
export const payStartPath = (via: PayMethod | null | undefined, token: string): string | null =>
  via === 'bkash' ? `/pay/bkash/start?t=${token}` : via === 'sslcommerz' ? `/pay/sslcommerz/start?t=${token}` : null
