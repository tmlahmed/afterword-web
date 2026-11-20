import type { Order } from '../../payload-types'

/**
 * Parcels: an order goes out as one parcel, or as two when books in stock are sent first and
 * the books ordered in follow when they arrive (each parcel has its own delivery fee). Each parcel has its
 * own stage and the amount the courier collects for it.
 */
export type Parcel = NonNullable<Order['parcels']>[number]
export type ParcelStatus = Parcel['status']
type Line = NonNullable<Order['lines']>[number]

const OPEN: ParcelStatus[] = ['pending', 'packing', 'shipped']

/** The order's parcels. Orders from before parcels existed are read as one parcel. */
export const parcelsOf = (order: Pick<Order, 'parcels' | 'status' | 'payOnDelivery' | 'courier' | 'trackingId'>): Parcel[] => {
  if (order.parcels?.length) return order.parcels.map((p) => ({ ...p }))
  const status: ParcelStatus =
    order.status === 'packing' || order.status === 'shipped' || order.status === 'delivered' || order.status === 'returned' || order.status === 'cancelled'
      ? order.status
      : 'pending'
  return [{ status, collect: order.payOnDelivery ?? 0, courier: order.courier, trackingId: order.trackingId }]
}

export const linesIn = (lines: Line[] | null | undefined, parcel: number): Line[] => (lines ?? []).filter((l) => (l.parcel ?? 0) === parcel)

/** A parcel waiting for books becomes ready to pack once every book in it is set aside. */
export const readyParcels = (lines: Line[] | null | undefined, parcels: Parcel[]): Parcel[] =>
  parcels.map((p, i) => (p.status === 'pending' && linesIn(lines, i).every((l) => l.allocated) ? { ...p, status: 'packing' } : p))

/** The order's stage, from its parcels: the most urgent work comes first. */
export const overallStatus = (parcels: Parcel[]): Order['status'] => {
  const live = parcels.filter((p) => p.status !== 'cancelled')
  if (live.length === 0) return 'cancelled'
  if (live.some((p) => p.status === 'shipped')) return 'shipped'
  if (live.some((p) => p.status === 'packing')) return 'packing'
  if (live.some((p) => p.status === 'pending')) return 'awaiting_stock'
  if (live.some((p) => p.status === 'delivered')) return 'delivered'
  return 'returned'
}

/** What couriers still have to collect: parcels not yet delivered, returned or cancelled. */
export const stillToCollect = (parcels: Parcel[]): number =>
  parcels.filter((p) => OPEN.includes(p.status)).reduce((sum, p) => sum + (p.collect ?? 0), 0)

/**
 * After a payment is recorded, lower what couriers collect so the open parcels add up to what
 * is still owed. The last parcel is lowered first: it is the one furthest away.
 */
export const rebalance = (parcels: Parcel[], owed: number): Parcel[] => {
  const next = parcels.map((p) => ({ ...p }))
  let excess = stillToCollect(next) - Math.max(0, owed)
  for (let i = next.length - 1; i >= 0 && excess > 0; i--) {
    if (!OPEN.includes(next[i].status) || next[i].status === 'shipped') continue
    const cut = Math.min(next[i].collect ?? 0, excess)
    next[i].collect = (next[i].collect ?? 0) - cut
    excess -= cut
  }
  return next
}

export const PARCEL_NAME = (index: number, count: number) => (count > 1 ? (index === 0 ? 'Parcel 1 (in stock)' : 'Parcel 2 (ordered in)') : 'Parcel')
