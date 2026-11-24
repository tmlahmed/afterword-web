import type { Payload, PayloadRequest } from 'payload'

import type { Order } from '../../payload-types'

export type Risk = { risk: 'none' | 'check' | 'high'; riskNote: string | null }

const idOf = (v: unknown): number | null => (typeof v === 'object' && v !== null ? (v as { id: number }).id : typeof v === 'number' ? v : null)

/**
 * Is this cash-on-delivery order worth a call before confirming? A refused parcel costs two
 * delivery fees and ties up the books, so an order is flagged when:
 * - the customer refused a parcel before (twice or more: high risk), or
 * - it is their first order and the cash to collect is above the amount in Shop settings, or
 * - their earlier orders were all cancelled.
 * Orders paid in full are never flagged. The rule is plain so staff can explain it.
 */
export const assessRisk = (
  order: Pick<Order, 'payOnDelivery'>,
  history: { refused: number; delivered: number; cancelled: number },
  firstOrderAbove: number,
): Risk => {
  const cash = order.payOnDelivery ?? 0
  if (cash <= 0) return { risk: 'none', riskNote: null }
  const { refused, delivered, cancelled } = history
  if (refused >= 2) return { risk: 'high', riskNote: `Refused ${refused} parcels before${delivered ? `; ${delivered} delivered` : ''}` }
  if (refused === 1) return { risk: 'check', riskNote: `Refused a parcel before${delivered ? `; ${delivered} delivered` : ''}` }
  if (!delivered && cancelled >= 2) return { risk: 'check', riskNote: `${cancelled} earlier orders cancelled, none delivered` }
  if (!delivered && firstOrderAbove > 0 && cash >= firstOrderAbove) return { risk: 'check', riskNote: `First order, ৳${cash.toLocaleString('en-IN')} cash on delivery` }
  return { risk: 'none', riskNote: null }
}

/** The customer's record before this order: parcels refused, orders delivered and cancelled. */
export const customerHistory = async (payload: Payload, order: Pick<Order, 'id' | 'customer'>, req?: Partial<PayloadRequest>) => {
  const customerId = idOf(order.customer)
  if (!customerId) return { refused: 0, delivered: 0, cancelled: 0 }
  const [customer, past] = await Promise.all([
    payload.findByID({ collection: 'customers', id: customerId, depth: 0, overrideAccess: true, req, select: { refusedCount: true } }),
    payload.find({
      collection: 'orders',
      where: { and: [{ customer: { equals: customerId } }, { id: { not_equals: order.id } }] },
      select: { status: true },
      depth: 0,
      limit: 200,
      overrideAccess: true,
      req,
    }),
  ])
  return {
    refused: customer.refusedCount ?? 0,
    delivered: past.docs.filter((o) => o.status === 'delivered').length,
    cancelled: past.docs.filter((o) => o.status === 'cancelled').length,
  }
}
