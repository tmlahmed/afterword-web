import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { Edition, Pricing } from '../payload-types'
import { dbFor } from './orders/stock'

/** Copies taken from (or given back to) one lot, and what each cost. `lot` is null for copies no lot accounted for. */
export type Allocation = { lot: number | null; quantity: number; cost: number | null }

const rows = (result: unknown): Record<string, unknown>[] => ((result as { rows?: unknown[] }).rows ?? (result as unknown[])) as Record<string, unknown>[]
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * What each copy on a purchase order really cost in taka. Each line's supplier price is
 * converted at the rate actually paid; the shipment's other costs (freight, duty, clearing…)
 * are shared out by value, so a ৳1,200 book carries twice the share of a ৳600 one. When no
 * line has a price, they are shared out by copies instead.
 */
export const landedCosts = (
  lines: { quantity: number; unitCost?: number | null }[],
  rate: number,
  expenses: number,
): { unitCost: number | null; landedCost: number | null }[] => {
  const each = lines.map((l) => (typeof l.unitCost === 'number' && l.unitCost >= 0 ? l.unitCost * (rate > 0 ? rate : 1) : null))
  const goods = lines.reduce((sum, l, i) => sum + (each[i] ?? 0) * l.quantity, 0)
  const copies = lines.reduce((sum, l) => sum + l.quantity, 0)
  return lines.map((l, i) => {
    const unit = each[i]
    if (goods > 0) {
      if (unit === null) return { unitCost: null, landedCost: null }
      const share = (unit * l.quantity) / goods
      return { unitCost: round2(unit), landedCost: round2(unit + (expenses * share) / l.quantity) }
    }
    // Nothing priced: share the costs by copies, so the shipping is still counted.
    const perCopy = copies ? expenses / copies : 0
    return { unitCost: unit === null ? null : round2(unit), landedCost: unit === null && !expenses ? null : round2((unit ?? 0) + perCopy) }
  })
}

/** A cost for copies with no purchase record: printed price less the usual supplier discount, at the exchange rate you pay. */
export const estimateCost = (book: Pick<Edition, 'listPrice' | 'listCurrency' | 'price'>, pricing: Pricing): number | null => {
  if (book.listPrice && book.listCurrency) {
    const rate = book.listCurrency === 'BDT' ? 1 : (pricing.rates ?? []).find((r) => r.currency === book.listCurrency)?.exchangeRate
    if (rate) return round2(book.listPrice * rate * (1 - (pricing.typicalBuyDiscount ?? 35) / 100))
  }
  return null
}

/**
 * Take copies of a book from its lots, oldest first, inside the caller's transaction. The lots
 * are locked while this runs, so two orders can never both take the same copy. Copies beyond
 * what the lots hold (which should not happen) come back with no lot and no cost.
 */
export const takeFromLots = async (payload: Payload, editionId: number, quantity: number, req?: Partial<PayloadRequest>): Promise<Allocation[]> => {
  const db = await dbFor(payload, req)
  const lots = rows(
    await db.execute(
      sql`SELECT id, remaining, landed_cost FROM stock_lots WHERE edition_id = ${editionId} AND remaining > 0 ORDER BY received_at ASC, id ASC FOR UPDATE`,
    ),
  )
  const taken: Allocation[] = []
  let need = quantity
  for (const lot of lots) {
    if (need <= 0) break
    const take = Math.min(need, Number(lot.remaining))
    await db.execute(sql`UPDATE stock_lots SET remaining = remaining - ${take} WHERE id = ${Number(lot.id)}`)
    taken.push({ lot: Number(lot.id), quantity: take, cost: num(lot.landed_cost) })
    need -= take
  }
  if (need > 0) taken.push({ lot: null, quantity: need, cost: null })
  return taken
}

/** Put copies back into the lots they came from. */
export const giveBackToLots = async (payload: Payload, allocations: Allocation[], req?: Partial<PayloadRequest>): Promise<void> => {
  const db = await dbFor(payload, req)
  for (const a of allocations) {
    if (a.lot !== null && a.quantity > 0) await db.execute(sql`UPDATE stock_lots SET remaining = remaining + ${a.quantity} WHERE id = ${a.lot}`)
  }
}

/** The copies an order still holds of a book, lot by lot: everything taken for it, less anything already given back. */
export const heldByOrder = async (payload: Payload, orderId: number, editionId: number, req?: Partial<PayloadRequest>): Promise<Allocation[]> => {
  const moves = await payload.find({
    collection: 'stock-movements',
    where: { and: [{ order: { equals: orderId } }, { edition: { equals: editionId } }] },
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
    select: { quantity: true, lots: true },
  })
  const held = new Map<number | null, Allocation>()
  for (const m of moves.docs) {
    const sign = (m.quantity ?? 0) < 0 ? 1 : -1
    for (const a of (m.lots as Allocation[] | null) ?? []) {
      const cur = held.get(a.lot) ?? { lot: a.lot, quantity: 0, cost: a.cost }
      cur.quantity += sign * a.quantity
      held.set(a.lot, cur)
    }
  }
  // Latest lots first: a part-return gives back the copies taken last.
  return [...held.values()].filter((a) => a.quantity > 0).sort((a, b) => (b.lot ?? 0) - (a.lot ?? 0))
}

/** The printed price of the copies that go out next: the oldest lot with copies left. */
export const nextLotPrice = async (
  payload: Payload,
  editionId: number,
  req?: Partial<PayloadRequest>,
): Promise<{ listPrice: number; listCurrency: string; landedCost: number | null } | null> => {
  const db = await dbFor(payload, req)
  const [lot] = rows(
    await db.execute(
      sql`SELECT list_price, list_currency, landed_cost FROM stock_lots WHERE edition_id = ${editionId} AND remaining > 0 ORDER BY received_at ASC, id ASC LIMIT 1`,
    ),
  )
  if (!lot || lot.list_price === null || !lot.list_currency) return null
  return { listPrice: Number(lot.list_price), listCurrency: String(lot.list_currency), landedCost: num(lot.landed_cost) }
}

/** Copies of a book still in lots, for the check that the lots and the stock ledger agree. */
export const copiesInLots = async (payload: Payload, editionId: number, req?: Partial<PayloadRequest>): Promise<number> => {
  const db = await dbFor(payload, req)
  const [row] = rows(await db.execute(sql`SELECT COALESCE(SUM(remaining), 0) AS n FROM stock_lots WHERE edition_id = ${editionId}`))
  return Number(row?.n ?? 0)
}

const REASON_NOTE: Record<string, string> = {
  opening: 'Opening stock',
  received: 'Received without a purchase order',
  released: 'Given back by an order',
  return: 'Returned by a customer',
  adjustment: 'Stock count correction',
}

/**
 * The lots a stock movement takes copies from or puts them into, worked out as it is recorded:
 * - copies going out (a sale, damage, a correction down) come from the oldest lots;
 * - copies an order gives back go back into the lots they came from;
 * - any other copies coming in start a new lot, costed like the book's latest lot (or estimated).
 * Receiving a purchase order makes its lots itself and passes them in.
 */
export const lotsForMovement = async (
  req: PayloadRequest,
  data: { edition?: unknown; quantity?: number | null; reason?: string | null; order?: unknown; lots?: unknown },
): Promise<Allocation[]> => {
  if (Array.isArray(data.lots) && data.lots.length) return data.lots as Allocation[]
  const { payload } = req
  const editionId = typeof data.edition === 'object' && data.edition !== null ? (data.edition as { id: number }).id : Number(data.edition)
  const quantity = Number(data.quantity ?? 0)
  if (!editionId || !quantity) return []
  if (quantity < 0) return takeFromLots(payload, editionId, -quantity, req)

  let left = quantity
  const back: Allocation[] = []
  const orderId = typeof data.order === 'object' && data.order !== null ? (data.order as { id: number }).id : (data.order as number | null | undefined)
  if (orderId && (data.reason === 'released' || data.reason === 'return')) {
    for (const held of await heldByOrder(payload, orderId, editionId, req)) {
      if (left <= 0 || held.lot === null) continue
      const q = Math.min(left, held.quantity)
      back.push({ ...held, quantity: q })
      left -= q
    }
    await giveBackToLots(payload, back, req)
  }
  if (left > 0) {
    const [book, latest, pricing] = await Promise.all([
      payload.findByID({ collection: 'editions', id: editionId, depth: 0, req, overrideAccess: true, select: { listPrice: true, listCurrency: true, price: true } }),
      payload.find({ collection: 'stock-lots', where: { edition: { equals: editionId } }, sort: '-receivedAt', limit: 1, depth: 0, req, overrideAccess: true }),
      payload.findGlobal({ slug: 'pricing', depth: 0, req, overrideAccess: true }),
    ])
    const last = latest.docs[0]
    const cost = last?.landedCost ?? estimateCost(book, pricing)
    const lot = await payload.create({
      collection: 'stock-lots',
      data: {
        edition: editionId,
        quantity: left,
        remaining: left,
        receivedAt: new Date().toISOString(),
        listPrice: last?.listPrice ?? book.listPrice,
        listCurrency: last?.listCurrency ?? book.listCurrency,
        unitCost: last?.unitCost ?? null,
        landedCost: cost,
        estimated: last ? Boolean(last.estimated) : true,
        note: REASON_NOTE[data.reason ?? ''] ?? null,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    back.push({ lot: lot.id, quantity: left, cost })
  }
  return back
}

/** A shipment's other costs added up, in taka. */
export const expensesTotal = (expenses: unknown): number =>
  Array.isArray(expenses) ? expenses.reduce((sum: number, e) => sum + (Number((e as { amount?: number }).amount) || 0), 0) : 0
