import type { Payload } from 'payload'

const idOf = (v: unknown): number => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))

export type ToOrderRow = {
  id: number
  title: string
  author: string
  isbn: string
  publisher: string
  supplier: string
  printed: string
  /** Copies confirmed orders are waiting for. */
  waiting: number
  /** Copies on orders not yet confirmed (advance not paid). */
  unconfirmed: number
  /** Copies already on purchase orders not yet received. */
  onOrder: number
  /** Copies on the shelf not set aside for anyone. */
  free: number
  /** What still has to be ordered from a supplier. */
  toOrder: number
  waitingSince: string
  orders: { id: number; number: string; quantity: number; confirmed: boolean; since: string }[]
  purchaseOrders: { id: number; reference: string; quantity: number }[]
}

const SYMBOL: Record<string, string> = { INR: '₹', GBP: '£', USD: '$', EUR: '€', BDT: '৳' }

/**
 * Books to order from suppliers for customers already waiting: every copy on an order that
 * has not been set aside yet (On Request, pre-orders, or stock that ran out), less what is
 * already on purchase orders on their way and anything free on the shelf. A list to order
 * from by hand; nothing is ordered automatically.
 */
export const toOrderReport = async (payload: Payload): Promise<ToOrderRow[]> => {
  const [orders, purchases] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { status: { in: ['placed', 'awaiting_stock', 'packing', 'shipped', 'delivered'] } },
      select: { number: true, status: true, createdAt: true, lines: true, parcels: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'purchase-orders',
      where: { status: { in: ['draft', 'ordered'] } },
      select: { reference: true, lines: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ])

  const need = new Map<number, Pick<ToOrderRow, 'waiting' | 'unconfirmed' | 'orders'>>()
  for (const o of orders.docs) {
    const confirmed = o.status !== 'placed'
    for (const line of o.lines ?? []) {
      if (line.allocated) continue
      const parcel = (o.parcels ?? [])[line.parcel ?? 0]
      // Only books still to come: not cancelled, not already sent.
      if (parcel && parcel.status !== 'pending') continue
      const edition = idOf(line.edition)
      const n = need.get(edition) ?? { waiting: 0, unconfirmed: 0, orders: [] }
      if (confirmed) n.waiting += line.quantity
      else n.unconfirmed += line.quantity
      n.orders.push({ id: o.id, number: o.number ?? `#${o.id}`, quantity: line.quantity, confirmed, since: o.createdAt })
      need.set(edition, n)
    }
  }
  if (!need.size) return []

  const coming = new Map<number, ToOrderRow['purchaseOrders']>()
  for (const po of purchases.docs) {
    for (const line of po.lines ?? []) {
      const edition = idOf(line.edition)
      coming.set(edition, [...(coming.get(edition) ?? []), { id: po.id, reference: po.reference, quantity: line.quantity }])
    }
  }

  const books = await payload.find({
    collection: 'editions',
    where: { id: { in: [...need.keys()] } },
    select: { title: true, authorLine: true, isbn13: true, publisher: true, supplier: true, listPrice: true, listCurrency: true, stockOnHand: true },
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })

  return books.docs
    .map((b) => {
      const n = need.get(b.id)!
      const purchaseOrders = coming.get(b.id) ?? []
      const onOrder = purchaseOrders.reduce((sum, p) => sum + p.quantity, 0)
      const free = Math.max(0, b.stockOnHand ?? 0)
      const name = (v: unknown) => (typeof v === 'object' && v !== null ? ((v as { name?: string }).name ?? '') : '')
      return {
        id: b.id,
        title: b.title,
        author: b.authorLine ?? '',
        isbn: b.isbn13 ?? '',
        publisher: name(b.publisher),
        supplier: name(b.supplier),
        printed: b.listPrice ? `${SYMBOL[b.listCurrency ?? ''] ?? ''}${b.listPrice}` : '',
        ...n,
        onOrder,
        free,
        toOrder: Math.max(0, n.waiting - onOrder - free),
        waitingSince: n.orders.reduce((min, o) => (o.since < min ? o.since : min), n.orders[0].since),
        purchaseOrders,
      }
    })
    .sort((a, b) => (a.supplier || '~').localeCompare(b.supplier || '~') || a.waitingSince.localeCompare(b.waitingSince))
}
