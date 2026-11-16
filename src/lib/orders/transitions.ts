import { APIError, type Payload } from 'payload'

import type { Order } from '../../payload-types'
import { notifyOrder } from '../notify'
import { shopRules } from './prepare'
import { pointsEarned } from './pricing'
import { recordMovement, takeCopies } from './stock'

const idOf = (v: unknown): number => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))
const fail = (message: string): never => {
  throw new APIError(message, 400, undefined, true)
}

export type OrderAction =
  | { action: 'confirm' }
  | { action: 'record_payment'; amount: number; method: string; reference?: string }
  | { action: 'ship'; courier: string; trackingId: string }
  | { action: 'deliver' }
  | { action: 'return' }
  | { action: 'cancel'; reason?: string }

type Patch = Partial<Order>

const save = async (payload: Payload, order: Order, patch: Patch, event: string, by: string): Promise<Order> =>
  payload.update({
    collection: 'orders',
    id: order.id,
    data: { ...patch, timeline: [...(order.timeline ?? []), { at: new Date().toISOString(), event, by }] },
    depth: 0,
    overrideAccess: true,
  })

/** Try to set aside copies for every line still waiting. Returns the lines as they now stand. */
const allocateLines = async (payload: Payload, order: Order): Promise<NonNullable<Order['lines']>> => {
  const lines = [...(order.lines ?? [])]
  for (const [i, line] of lines.entries()) {
    if (line.allocated) continue
    if (await takeCopies(payload, idOf(line.edition), line.quantity)) {
      await recordMovement(payload, idOf(line.edition), -line.quantity, 'sale', `Order ${order.number}`)
      lines[i] = { ...line, allocated: true }
    }
  }
  return lines
}

/** Write a reward points entry for an order (earned on delivery, or given back). */
const rewardEntry = async (payload: Payload, order: Order, points: number, reason: 'earned' | 'refunded') => {
  const customerId = idOf(order.customer)
  if (!customerId || points === 0) return
  await payload.create({
    collection: 'reward-entries',
    data: { customer: customerId, points, reason, order: order.id, note: `Order ${order.number}` },
    depth: 0,
    overrideAccess: true,
  })
}

const confirmed = async (payload: Payload, order: Order, by: string, extra: Patch = {}, event = 'Confirmed'): Promise<Order> => {
  const lines = await allocateLines(payload, order)
  const ready = lines.every((l) => l.allocated)
  const next = await save(payload, order, { ...extra, lines, status: ready ? 'packing' : 'awaiting_stock' }, event, by)
  notifyOrder(payload, next, 'confirmed')
  return next
}

/**
 * The only way an order changes after it is placed. Each action checks that it makes sense
 * for the order's current stage, records who did it, and tells the customer where relevant.
 */
export const runOrderAction = async (payload: Payload, orderId: number, input: OrderAction, by: string): Promise<Order> => {
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const paid = order.paid ?? 0

  switch (input.action) {
    case 'confirm': {
      if (order.status !== 'placed') fail('Only a newly placed order can be confirmed.')
      if ((order.payNow ?? 0) > paid) fail(`Record the advance payment of ৳${(order.payNow ?? 0) - paid} first.`)
      return confirmed(payload, order, by)
    }

    case 'record_payment': {
      const amount = Math.round(Number(input.amount))
      if (!Number.isFinite(amount) || amount <= 0) fail('Enter the amount received.')
      if (['cancelled', 'returned'].includes(order.status)) fail('This order is closed.')
      if (paid + amount > (order.total ?? 0)) fail(`That is more than is owed. ৳${(order.total ?? 0) - paid} remains.`)
      const nowPaid = paid + amount
      const patch: Patch = {
        paid: nowPaid,
        payOnDelivery: Math.max(0, (order.total ?? 0) - nowPaid),
        paymentStatus: nowPaid >= (order.total ?? 0) ? 'paid' : 'advance_paid',
        payments: [...(order.payments ?? []), { amount, method: input.method || 'cash', reference: input.reference, at: new Date().toISOString() }],
      }
      const event = `Payment of ৳${amount} received (${input.method}${input.reference ? `, ${input.reference}` : ''})`
      // Paying the advance confirms a placed order.
      if (order.status === 'placed' && nowPaid >= (order.payNow ?? 0)) return confirmed(payload, order, by, patch, `${event}. Confirmed`)
      return save(payload, order, patch, event, by)
    }

    case 'ship': {
      if (order.status !== 'packing') fail('Only an order that is ready to pack can be handed to a courier.')
      if (!input.courier?.trim() || !input.trackingId?.trim()) fail('Enter the courier and the tracking number.')
      const next = await save(payload, order, { status: 'shipped', courier: input.courier.trim(), trackingId: input.trackingId.trim() }, `Handed to ${input.courier.trim()} (${input.trackingId.trim()})`, by)
      notifyOrder(payload, next, 'shipped')
      return next
    }

    case 'deliver': {
      if (order.status !== 'shipped') fail('Only an order with the courier can be marked delivered.')
      const collected = order.payOnDelivery ?? 0
      const { rewards } = await shopRules({ payload })
      const earned = pointsEarned({ subtotal: order.subtotal ?? 0, discount: order.discount ?? 0, rewards: order.rewardDiscount ?? 0 }, rewards)
      const next = await save(
        payload,
        order,
        {
          status: 'delivered',
          paid: paid + collected,
          payOnDelivery: 0,
          paymentStatus: 'paid',
          pointsEarned: earned,
          payments: collected ? [...(order.payments ?? []), { amount: collected, method: 'cash on delivery', reference: order.courier ?? undefined, at: new Date().toISOString() }] : order.payments,
        },
        `${collected ? `Delivered. ৳${collected} collected by the courier` : 'Delivered'}${earned ? `. ${earned} reward points earned` : ''}`,
        by,
      )
      await rewardEntry(payload, next, earned, 'earned')
      notifyOrder(payload, next, 'delivered')
      return next
    }

    case 'return': {
      if (order.status !== 'shipped') fail('Only an order with the courier can come back as returned.')
      for (const line of order.lines ?? []) {
        if (line.allocated) await recordMovement(payload, idOf(line.edition), line.quantity, 'return', `Order ${order.number} returned undelivered`)
      }
      const customerId = idOf(order.customer)
      if (customerId) {
        const customer = await payload.findByID({ collection: 'customers', id: customerId, depth: 0, overrideAccess: true })
        await payload.update({ collection: 'customers', id: customerId, data: { refusedCount: (customer.refusedCount ?? 0) + 1 }, depth: 0, overrideAccess: true })
      }
      await rewardEntry(payload, order, order.pointsUsed ?? 0, 'refunded')
      return save(payload, order, { status: 'returned', lines: (order.lines ?? []).map((l) => ({ ...l, allocated: false })) }, 'Returned undelivered. Books back in stock', by)
    }

    case 'cancel': {
      if (!['placed', 'awaiting_stock', 'packing'].includes(order.status)) fail('An order already with the courier cannot be cancelled. Mark it returned when it comes back.')
      for (const line of order.lines ?? []) {
        if (line.allocated) await recordMovement(payload, idOf(line.edition), line.quantity, 'released', `Order ${order.number} cancelled`)
      }
      await rewardEntry(payload, order, order.pointsUsed ?? 0, 'refunded')
      const next = await save(
        payload,
        order,
        { status: 'cancelled', lines: (order.lines ?? []).map((l) => ({ ...l, allocated: false })) },
        `Cancelled${input.reason ? `: ${input.reason}` : ''}${paid > 0 ? `. ৳${paid} to be refunded` : ''}`,
        by,
      )
      notifyOrder(payload, next, 'cancelled')
      return next
    }
  }
}

/**
 * When copies of a book arrive, give them to the confirmed orders that have waited longest.
 * An order with everything set aside moves to "To pack" and the customer is told.
 */
export const allocateWaitingOrders = async (payload: Payload, editionId: number): Promise<number> => {
  const waiting = await payload.find({
    collection: 'orders',
    where: { and: [{ status: { equals: 'awaiting_stock' } }, { 'lines.edition': { equals: editionId } }] },
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  let released = 0
  for (const order of waiting.docs) {
    const lines = await allocateLines(payload, order)
    const changed = lines.some((l, i) => l.allocated !== order.lines?.[i]?.allocated)
    if (!changed) continue
    const ready = lines.every((l) => l.allocated)
    const next = await save(payload, order, { lines, status: ready ? 'packing' : 'awaiting_stock' }, ready ? 'Books arrived. Ready to pack' : 'Some books arrived', 'System')
    if (ready) {
      released++
      notifyOrder(payload, next, 'arrived')
    }
  }
  return released
}
