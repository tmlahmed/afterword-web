import { APIError, type Payload } from 'payload'

import type { Order } from '../../payload-types'
import { notifyOrder } from '../notify'
import { linesIn, overallStatus, type Parcel, PARCEL_NAME, parcelsOf, readyParcels, rebalance, stillToCollect } from './parcels'
import { shopRules } from './prepare'
import { pointsEarned } from './pricing'
import { recordMovement, takeCopies } from './stock'

const idOf = (v: unknown): number => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))
const fail = (message: string): never => {
  throw new APIError(message, 400, undefined, true)
}

/** `parcel` picks which parcel (0 or 1) to ship, deliver or return; it defaults to the one it can mean. */
export type OrderAction =
  | { action: 'confirm' }
  | { action: 'record_payment'; amount: number; method: string; reference?: string }
  | { action: 'ship'; courier: string; trackingId: string; parcel?: number; courierStatus?: string; courierFee?: number }
  | { action: 'unship'; parcel?: number; reason?: string }
  | { action: 'courier_status'; parcel: number; courierStatus: string; note?: string }
  | { action: 'deliver'; parcel?: number }
  | { action: 'return'; parcel?: number }
  | { action: 'cancel'; reason?: string }

type Patch = Partial<Order>
type Lines = NonNullable<Order['lines']>

const save = async (payload: Payload, order: Order, patch: Patch, event: string, by: string): Promise<Order> =>
  payload.update({
    collection: 'orders',
    id: order.id,
    data: { ...patch, timeline: [...(order.timeline ?? []), { at: new Date().toISOString(), event, by }] },
    depth: 0,
    overrideAccess: true,
  })

/** Try to set aside copies for the lines still waiting, in parcels that are still waiting. */
const allocateLines = async (payload: Payload, order: Order, parcels: Parcel[]): Promise<Lines> => {
  const lines = [...(order.lines ?? [])]
  for (const [i, line] of lines.entries()) {
    if (line.allocated || parcels[line.parcel ?? 0]?.status !== 'pending') continue
    if (await takeCopies(payload, idOf(line.edition), line.quantity)) {
      await recordMovement(payload, idOf(line.edition), -line.quantity, 'sale', `Order ${order.number}`)
      lines[i] = { ...line, allocated: true }
    }
  }
  return lines
}

/** Put the copies of some lines back on the shelf. */
const releaseLines = async (payload: Payload, order: Order, lines: Lines, which: (line: Lines[number]) => boolean, reason: 'released' | 'return', note: string): Promise<Lines> => {
  const next = [...lines]
  for (const [i, line] of next.entries()) {
    if (!which(line) || !line.allocated) continue
    await recordMovement(payload, idOf(line.edition), line.quantity, reason, note)
    next[i] = { ...line, allocated: false }
  }
  return next
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

/** The parcel an action means: the one given, or the only one in the right stage. */
const pickParcel = (parcels: Parcel[], wanted: number | undefined, stage: Parcel['status'], verb: string): number => {
  if (typeof wanted === 'number') {
    if (parcels[wanted]?.status !== stage) fail(`That parcel cannot be ${verb} now.`)
    return wanted
  }
  const index = parcels.findIndex((p) => p.status === stage)
  if (index === -1) fail(`There is no parcel to be ${verb}.`)
  return index
}

const confirmed = async (payload: Payload, order: Order, by: string, extra: Patch = {}, event = 'Confirmed'): Promise<Order> => {
  const before = parcelsOf(order)
  const lines = await allocateLines(payload, order, before)
  const parcels = readyParcels(lines, extra.parcels ?? before)
  const next = await save(payload, order, { ...extra, lines, parcels, status: overallStatus(parcels), payOnDelivery: stillToCollect(parcels) }, event, by)
  notifyOrder(payload, next, 'confirmed')
  return next
}

/**
 * The only way an order changes after it is placed. Each action checks that it makes sense
 * for the order's current stage, records who did it, and tells the customer where relevant.
 * Orders in two parcels move parcel by parcel.
 */
export const runOrderAction = async (payload: Payload, orderId: number, input: OrderAction, by: string): Promise<Order> => {
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const paid = order.paid ?? 0
  const parcels = parcelsOf(order)
  const name = (i: number) => PARCEL_NAME(i, parcels.length)

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
      // Anything paid beyond the advance comes off what the couriers collect.
      const balanced = rebalance(parcels, Math.max(0, (order.total ?? 0) - nowPaid))
      const patch: Patch = {
        paid: nowPaid,
        parcels: balanced,
        payOnDelivery: stillToCollect(balanced),
        paymentStatus: nowPaid >= (order.total ?? 0) ? 'paid' : 'advance_paid',
        payments: [...(order.payments ?? []), { amount, method: input.method || 'cash', reference: input.reference, at: new Date().toISOString() }],
      }
      const event = `Payment of ৳${amount} received (${input.method}${input.reference ? `, ${input.reference}` : ''})`
      // Paying the advance confirms a placed order.
      if (order.status === 'placed' && nowPaid >= (order.payNow ?? 0)) return confirmed(payload, order, by, patch, `${event}. Confirmed`)
      return save(payload, order, patch, event, by)
    }

    case 'ship': {
      if (order.status === 'placed') fail('Confirm the order before handing it to a courier.')
      const i = pickParcel(parcels, input.parcel, 'packing', 'handed to a courier')
      if (!input.courier?.trim() || !input.trackingId?.trim()) fail('Enter the courier and the tracking number.')
      parcels[i] = {
        ...parcels[i],
        status: 'shipped',
        courier: input.courier.trim(),
        trackingId: input.trackingId.trim(),
        courierStatus: input.courierStatus ?? null,
        courierFee: input.courierFee ?? null,
        courierCheckedAt: input.courierStatus ? new Date().toISOString() : null,
      }
      const next = await save(
        payload,
        order,
        { parcels, status: overallStatus(parcels), courier: input.courier.trim(), trackingId: input.trackingId.trim(), payOnDelivery: stillToCollect(parcels) },
        `${name(i)} handed to ${input.courier.trim()} (${input.trackingId.trim()})`,
        by,
      )
      notifyOrder(payload, next, 'shipped')
      return next
    }

    case 'unship': {
      // The courier never took the parcel (pickup cancelled, or booked by mistake): back to packing.
      const i = pickParcel(parcels, input.parcel, 'shipped', 'taken back from the courier')
      const was = parcels[i]
      parcels[i] = { ...was, status: 'packing', courier: null, trackingId: null, courierStatus: null, courierFee: null, courierCheckedAt: null }
      const other = parcels.find((p) => p.status === 'shipped')
      return save(
        payload,
        order,
        { parcels, status: overallStatus(parcels), courier: other?.courier ?? null, trackingId: other?.trackingId ?? null, payOnDelivery: stillToCollect(parcels) },
        `${name(i)} back to packing: ${was.courier ?? 'the courier'} did not take it${was.trackingId ? ` (${was.trackingId})` : ''}${input.reason ? `. ${input.reason}` : ''}`,
        by,
      )
    }

    case 'courier_status': {
      // What the courier says about a parcel. Only shown, and recorded in the history when it changes.
      const p = parcels[input.parcel]
      if (!p) fail('There is no such parcel.')
      const changed = p.courierStatus !== input.courierStatus
      parcels[input.parcel] = { ...p, courierStatus: input.courierStatus, courierCheckedAt: new Date().toISOString() }
      if (!changed && !input.note) {
        return payload.update({ collection: 'orders', id: order.id, data: { parcels }, depth: 0, overrideAccess: true })
      }
      return save(payload, order, { parcels }, `${name(input.parcel)}: ${p.courier ?? 'courier'} says “${input.courierStatus}”${input.note ? `. ${input.note}` : ''}`, by)
    }

    case 'deliver': {
      const i = pickParcel(parcels, input.parcel, 'shipped', 'marked delivered')
      const collected = parcels[i].collect ?? 0
      parcels[i] = { ...parcels[i], status: 'delivered' }
      const status = overallStatus(parcels)
      const nowPaid = paid + collected
      const finished = status === 'delivered'
      const { rewards } = await shopRules({ payload })
      const earned = finished ? pointsEarned({ subtotal: order.subtotal ?? 0, discount: order.discount ?? 0, rewards: order.rewardDiscount ?? 0 }, rewards) : 0
      const next = await save(
        payload,
        order,
        {
          parcels,
          status,
          paid: nowPaid,
          payOnDelivery: stillToCollect(parcels),
          paymentStatus: nowPaid >= (order.total ?? 0) ? 'paid' : nowPaid > 0 ? 'advance_paid' : order.paymentStatus,
          pointsEarned: finished ? earned : order.pointsEarned,
          payments: collected ? [...(order.payments ?? []), { amount: collected, method: 'cash on delivery', reference: parcels[i].courier ?? undefined, at: new Date().toISOString() }] : order.payments,
        },
        `${name(i)} delivered${collected ? `. ৳${collected} collected by the courier` : ''}${earned ? `. ${earned} reward points earned` : ''}`,
        by,
      )
      if (earned) await rewardEntry(payload, next, earned, 'earned')
      // The customer hears about each parcel; "arrived" texts for the second come when its books land.
      notifyOrder(payload, next, 'delivered')
      return next
    }

    case 'return': {
      const i = pickParcel(parcels, input.parcel, 'shipped', 'marked returned')
      const lines = await releaseLines(payload, order, order.lines ?? [], (l) => (l.parcel ?? 0) === i, 'return', `Order ${order.number} returned undelivered`)
      parcels[i] = { ...parcels[i], status: 'returned' }
      const customerId = idOf(order.customer)
      if (customerId) {
        const customer = await payload.findByID({ collection: 'customers', id: customerId, depth: 0, overrideAccess: true })
        await payload.update({ collection: 'customers', id: customerId, data: { refusedCount: (customer.refusedCount ?? 0) + 1 }, depth: 0, overrideAccess: true })
      }
      const status = overallStatus(parcels)
      if (status === 'returned') await rewardEntry(payload, order, order.pointsUsed ?? 0, 'refunded')
      return save(payload, order, { lines, parcels, status, payOnDelivery: stillToCollect(parcels) }, `${name(i)} returned undelivered. Books back in stock`, by)
    }

    case 'cancel': {
      // Everything not yet sent is cancelled. A parcel with the courier must come back first.
      if (parcels.some((p) => p.status === 'shipped')) fail('A parcel is with the courier. Mark it delivered or returned first, then cancel the rest.')
      const open = parcels.map((p) => p.status === 'pending' || p.status === 'packing')
      if (order.status !== 'placed' && !open.some(Boolean)) fail('Nothing is left to cancel on this order.')
      const lines = await releaseLines(payload, order, order.lines ?? [], (l) => order.status === 'placed' || open[l.parcel ?? 0], 'released', `Order ${order.number} cancelled`)
      const next = parcels.map((p, i) => (order.status === 'placed' || open[i] ? { ...p, status: 'cancelled' as const } : p))
      const anyDelivered = next.some((p) => p.status === 'delivered')
      if (!anyDelivered) await rewardEntry(payload, order, order.pointsUsed ?? 0, 'refunded')
      // An advance paid for books that will no longer be sent is owed back.
      const refund = anyDelivered ? Math.min(paid, order.payNow ?? 0) : paid
      const status = anyDelivered ? 'delivered' : 'cancelled'
      const saved = await save(
        payload,
        order,
        { lines, parcels: next, status, payOnDelivery: stillToCollect(next) },
        `${anyDelivered ? 'Remaining books cancelled' : 'Cancelled'}${input.reason ? `: ${input.reason}` : ''}${refund > 0 ? `. ৳${refund} to be refunded` : ''}`,
        by,
      )
      notifyOrder(payload, saved, 'cancelled')
      return saved
    }
  }
}

/**
 * When copies of a book arrive, give them to the confirmed orders that have waited longest.
 * A parcel with every book set aside moves to "To pack", and the customer is told.
 */
export const allocateWaitingOrders = async (payload: Payload, editionId: number): Promise<number> => {
  const waiting = await payload.find({
    collection: 'orders',
    where: { and: [{ status: { in: ['awaiting_stock', 'packing', 'shipped', 'delivered'] } }, { 'lines.edition': { equals: editionId } }] },
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  let released = 0
  for (const order of waiting.docs) {
    const before = parcelsOf(order)
    if (!before.some((p) => p.status === 'pending')) continue
    const lines = await allocateLines(payload, order, before)
    const changed = lines.some((l, i) => l.allocated !== order.lines?.[i]?.allocated)
    if (!changed) continue
    const parcels = readyParcels(lines, before)
    const nowReady = parcels.some((p, i) => p.status === 'packing' && before[i].status === 'pending')
    const next = await save(
      payload,
      order,
      { lines, parcels, status: overallStatus(parcels), payOnDelivery: stillToCollect(parcels) },
      nowReady ? 'Books arrived. Ready to pack' : 'Some books arrived',
      'System',
    )
    if (nowReady) {
      released++
      notifyOrder(payload, next, 'arrived')
    }
  }
  return released
}

/** Lines in a parcel, for slips and pages. */
export { linesIn }
