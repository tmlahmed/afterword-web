import { APIError, type Payload } from 'payload'

import type { Order } from '../../payload-types'
import { linesIn, PARCEL_NAME, parcelsOf } from '../orders/parcels'
import { runOrderAction } from '../orders/transitions'
import { type Consignment, pathaoBook, pathaoCities, pathaoInfo, pathaoMode, pathaoStoreId, pathaoZones } from './pathao'
import { buildBooking, findZoneIn, matchCity, matchZone, outcomeOf, statusText } from './pathao-rules'

export const PATHAO = 'Pathao'

const fail = (message: string): never => {
  throw new APIError(message, 400, undefined, true)
}
const idOf = (v: unknown): number => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))

// Two presses of "Book" must not make two Pathao parcels.
const booking = new Set<string>()

/** Book one parcel of an order with Pathao, and mark it handed to the courier. */
export const bookWithPathao = async (payload: Payload, orderId: number, parcel: number | undefined, by: string): Promise<Order> => {
  if (pathaoMode() === 'off') fail('Pathao is not connected yet. Add the Pathao settings to the server, or enter the tracking number by hand.')
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  if (order.status === 'placed') fail('Confirm the order before handing it to a courier.')
  const parcels = parcelsOf(order)
  const i = typeof parcel === 'number' ? parcel : parcels.findIndex((p) => p.status === 'packing')
  if (parcels[i]?.status !== 'packing') fail('That parcel is not ready to pack.')

  const lock = `${orderId}:${i}`
  if (booking.has(lock)) fail('This parcel is already being booked.')
  booking.add(lock)
  try {
    const lines = linesIn(order.lines, i)
    const editions = await payload.find({
      collection: 'editions',
      where: { id: { in: lines.map((l) => idOf(l.edition)) } },
      depth: 0,
      limit: lines.length,
      overrideAccess: true,
      select: { weightG: true },
    })
    const grams = new Map(editions.docs.map((e) => [e.id, (e as { weightG?: number | null }).weightG]))

    // Send Pathao's city and zone when the area matches one clearly; otherwise Pathao reads the address.
    const cities = await pathaoCities().catch(() => [])
    const city = matchCity(order.district, cities)
    const zones = city ? await pathaoZones(city.id).catch(() => []) : []
    const zone = (order.area ? matchZone(order.area, zones) : undefined) ?? findZoneIn(order.street, zones)

    const built = buildBooking({
      storeId: await pathaoStoreId(),
      reference: parcels.length > 1 ? `${order.number}-${i + 1}` : (order.number ?? String(order.id)),
      name: order.contactName,
      phone: order.contactPhone,
      street: order.street,
      area: order.area ?? '',
      district: order.district,
      note: order.deliveryNote,
      gift: Boolean(order.giftWrap),
      books: lines.map((l) => ({ grams: grams.get(idOf(l.edition)), quantity: l.quantity })),
      collect: parcels[i].collect ?? 0,
      city,
      zone,
    })
    if ('problem' in built) return fail(built.problem)

    const made = await pathaoBook(built.booking).catch((err: Error) => fail(err.message))
    return runOrderAction(
      payload,
      orderId,
      {
        action: 'ship',
        parcel: i,
        courier: PATHAO,
        trackingId: made.consignment_id,
        courierStatus: statusText(made.order_status, made.order_status_slug),
        courierFee: typeof made.delivery_fee === 'number' ? made.delivery_fee : undefined,
      },
      by,
    )
  } finally {
    booking.delete(lock)
  }
}

/**
 * Ask Pathao where a parcel is and act on the answer: delivered and returned parcels move on by
 * themselves, a cancelled pickup goes back to packing, anything else is shown on the order.
 */
export const checkPathaoParcel = async (payload: Payload, orderId: number, parcel: number, by = PATHAO, known?: Consignment): Promise<string> => {
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const p = parcelsOf(order)[parcel]
  if (!p || p.status !== 'shipped' || p.courier !== PATHAO || !p.trackingId) fail('That parcel is not with Pathao.')
  const info = known ?? (await pathaoInfo(p!.trackingId!).catch((err: Error) => fail(err.message)))
  const said = statusText(info.order_status, info.order_status_slug)
  const outcome = outcomeOf(info.order_status_slug ?? info.order_status)
  const name = PARCEL_NAME(parcel, parcelsOf(order).length)

  await runOrderAction(
    payload,
    orderId,
    { action: 'courier_status', parcel, courierStatus: said, note: outcome === 'attention' ? 'Check with Pathao and finish this parcel by hand' : undefined },
    by,
  )
  if (outcome === 'delivered') await runOrderAction(payload, orderId, { action: 'deliver', parcel }, by)
  if (outcome === 'returned') await runOrderAction(payload, orderId, { action: 'return', parcel }, by)
  if (outcome === 'pickup_cancelled') await runOrderAction(payload, orderId, { action: 'unship', parcel, reason: 'Pathao cancelled the pickup' }, by)
  return `${name}: ${said}`
}

/** Check every parcel that is with Pathao. Run every half hour, and whenever Pathao calls the webhook. */
export const syncPathao = async (payload: Payload, onlyConsignment?: string): Promise<{ checked: number; moved: number; problems: string[] }> => {
  const result = { checked: 0, moved: 0, problems: [] as string[] }
  if (pathaoMode() === 'off') return result
  const orders = await payload.find({
    collection: 'orders',
    where: { and: [{ status: { equals: 'shipped' } }, onlyConsignment ? { 'parcels.trackingId': { equals: onlyConsignment } } : { 'parcels.courier': { equals: PATHAO } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const order of orders.docs) {
    const parcels = parcelsOf(order)
    for (const [i, p] of parcels.entries()) {
      if (p.status !== 'shipped' || p.courier !== PATHAO || !p.trackingId) continue
      if (onlyConsignment && p.trackingId !== onlyConsignment) continue
      result.checked++
      try {
        await checkPathaoParcel(payload, order.id, i)
        const after = parcelsOf(await payload.findByID({ collection: 'orders', id: order.id, depth: 0, overrideAccess: true }))[i]
        if (after?.status !== 'shipped') result.moved++
      } catch (err) {
        result.problems.push(`${order.number}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return result
}
