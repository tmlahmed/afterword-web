import type { Payload } from 'payload'

import type { Subject } from '../payload-types'

/**
 * Figures for the Reports screen and its CSV downloads. Everything is worked out from the
 * orders, stock ledger and catalogue as they stand, so there is nothing to keep in step.
 * Days are counted in Dhaka time.
 */

export type Period = { from: Date; to: Date; label: string; key: string }

const DHAKA_OFFSET_MS = 6 * 3600_000
/** Midnight in Dhaka on the day that contains `d`, as a real instant. */
const dhakaMidnight = (d: Date) => {
  const shifted = new Date(d.getTime() + DHAKA_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - DHAKA_OFFSET_MS)
}
export const dhakaDay = (d: Date | string) => new Date(new Date(d).getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10)

export const PERIODS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: '365d', label: 'Last 12 months' },
] as const

export const periodFrom = (key: string | undefined, now = new Date()): Period => {
  const today = dhakaMidnight(now)
  const end = new Date(now.getTime())
  const daysBack = (n: number) => new Date(today.getTime() - (n - 1) * 86400_000)
  const dhakaNow = new Date(now.getTime() + DHAKA_OFFSET_MS)
  const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS)
  switch (key) {
    case '7d':
      return { key, label: 'Last 7 days', from: daysBack(7), to: end }
    case '90d':
      return { key, label: 'Last 90 days', from: daysBack(90), to: end }
    case '365d':
      return { key, label: 'Last 12 months', from: daysBack(365), to: end }
    case 'month':
      return { key, label: 'This month', from: monthStart(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth()), to: end }
    case 'lastmonth': {
      const y = dhakaNow.getUTCFullYear()
      const m = dhakaNow.getUTCMonth()
      return { key, label: 'Last month', from: monthStart(y, m - 1), to: monthStart(y, m) }
    }
    default:
      return { key: '30d', label: 'Last 30 days', from: daysBack(30), to: end }
  }
}

type OrderRow = {
  id: number
  number?: string | null
  status: string
  paymentStatus: string
  paymentPlan?: string | null
  total?: number | null
  refunded?: number | null
  refundDue?: number | null
  subtotal?: number | null
  discount?: number | null
  delivery?: number | null
  paid?: number | null
  payNow?: number | null
  zone?: string | null
  district?: string | null
  courier?: string | null
  createdAt: string
  lines?: { edition: number | { id: number }; quantity: number; unitPrice?: number | null; title?: string | null }[] | null
  parcels?: { status: string; collect?: number | null; courier?: string | null }[] | null
}

const ORDER_SELECT = {
  number: true,
  refunded: true,
  refundDue: true,
  status: true,
  paymentStatus: true,
  paymentPlan: true,
  total: true,
  subtotal: true,
  discount: true,
  delivery: true,
  paid: true,
  payNow: true,
  zone: true,
  district: true,
  courier: true,
  createdAt: true,
  lines: true,
  parcels: true,
} as const

const idOf = (v: number | { id: number }) => (typeof v === 'object' ? v.id : v)
const sum = <T>(rows: T[], f: (r: T) => number | null | undefined) => rows.reduce((s, r) => s + (f(r) ?? 0), 0)

/** Sales in a period: totals, a day-by-day series, best sellers, subjects and districts. */
export const salesReport = async (payload: Payload, period: Period) => {
  const found = await payload.find({
    collection: 'orders',
    where: { and: [{ createdAt: { greater_than_equal: period.from.toISOString() } }, { createdAt: { less_than: period.to.toISOString() } }] },
    select: ORDER_SELECT,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const all = found.docs as unknown as OrderRow[]
  const live = all.filter((o) => o.status !== 'cancelled' && o.status !== 'returned')
  const lines = live.flatMap((o) => (o.lines ?? []).map((l) => ({ ...l, edition: idOf(l.edition) })))

  // Day by day, including days with no orders.
  const byDay = new Map<string, { orders: number; revenue: number; books: number }>()
  for (let t = dhakaMidnight(period.from).getTime(); t < period.to.getTime(); t += 86400_000) byDay.set(dhakaDay(new Date(t)), { orders: 0, revenue: 0, books: 0 })
  for (const o of live) {
    const day = byDay.get(dhakaDay(o.createdAt)) ?? { orders: 0, revenue: 0, books: 0 }
    day.orders++
    day.revenue += o.total ?? 0
    day.books += sum(o.lines ?? [], (l) => l.quantity)
    byDay.set(dhakaDay(o.createdAt), day)
  }

  // Best sellers.
  const byBook = new Map<number, { title: string; copies: number; revenue: number }>()
  for (const l of lines) {
    const b = byBook.get(l.edition) ?? { title: l.title ?? `Book ${l.edition}`, copies: 0, revenue: 0 }
    b.copies += l.quantity
    b.revenue += (l.unitPrice ?? 0) * l.quantity
    byBook.set(l.edition, b)
  }
  const bookIds = [...byBook.keys()]
  const editions = bookIds.length
    ? (
        await payload.find({
          collection: 'editions',
          where: { id: { in: bookIds } },
          select: { slug: true, authorLine: true, isbn13: true, subjects: true },
          depth: 1,
          pagination: false,
          overrideAccess: true,
        })
      ).docs
    : []
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const bestSellers = [...byBook.entries()]
    .map(([id, b]) => ({ id, ...b, author: editionById.get(id)?.authorLine ?? '', isbn: editionById.get(id)?.isbn13 ?? '' }))
    .sort((a, b) => b.copies - a.copies || b.revenue - a.revenue)

  // By subject: a book's first subject, so each sale counts once.
  const bySubject = new Map<string, { copies: number; revenue: number }>()
  for (const l of lines) {
    const subjects = editionById.get(l.edition)?.subjects ?? []
    const first = subjects.find((s): s is Subject => typeof s === 'object' && s !== null)
    const name = first?.name ?? 'No subject'
    const s = bySubject.get(name) ?? { copies: 0, revenue: 0 }
    s.copies += l.quantity
    s.revenue += (l.unitPrice ?? 0) * l.quantity
    bySubject.set(name, s)
  }

  const byDistrict = new Map<string, { orders: number; revenue: number }>()
  for (const o of live) {
    const d = byDistrict.get(o.district ?? '—') ?? { orders: 0, revenue: 0 }
    d.orders++
    d.revenue += o.total ?? 0
    byDistrict.set(o.district ?? '—', d)
  }

  // Money paid back (books taken back after delivery) comes off what the order brought in.
  const revenue = sum(live, (o) => (o.total ?? 0) - (o.refunded ?? 0))
  return {
    period,
    totals: {
      orders: live.length,
      revenue,
      books: sum(lines, (l) => l.quantity),
      bookSales: sum(live, (o) => o.subtotal) - sum(live, (o) => o.discount),
      delivery: sum(live, (o) => o.delivery),
      discounts: sum(live, (o) => o.discount),
      averageOrder: live.length ? Math.round(revenue / live.length) : 0,
      delivered: all.filter((o) => o.status === 'delivered').length,
      cancelled: all.filter((o) => o.status === 'cancelled').length,
      returned: all.filter((o) => o.status === 'returned').length,
      cashOnDelivery: live.filter((o) => o.paymentPlan === 'cod').length,
    },
    days: [...byDay.entries()].map(([day, d]) => ({ day, ...d })),
    bestSellers,
    subjects: [...bySubject.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue),
    districts: [...byDistrict.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue),
  }
}

/** Money not yet in the bank: cash the couriers hold, advances to check, advances held for books not yet here. */
export const moneyReport = async (payload: Payload) => {
  const open = await payload.find({
    collection: 'orders',
    where: { status: { in: ['placed', 'awaiting_stock', 'packing', 'shipped'] } },
    select: ORDER_SELECT,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const orders = open.docs as unknown as OrderRow[]
  // Each parcel with a courier, with what it is carrying in cash. Older orders without parcels count as one.
  const shippedParcels = orders.flatMap((o) =>
    o.parcels?.length
      ? o.parcels.filter((p) => p.status === 'shipped').map((p) => ({ order: o, courier: p.courier ?? o.courier, toCollect: p.collect ?? 0 }))
      : o.status === 'shipped'
        ? [{ order: o, courier: o.courier, toCollect: (o.total ?? 0) - (o.paid ?? 0) }]
        : [],
  )
  const withCouriers = shippedParcels.map((p) => ({ ...p.order, courier: p.courier, toCollect: p.toCollect }))
  const byCourier = new Map<string, { parcels: number; amount: number }>()
  for (const o of withCouriers) {
    const c = byCourier.get(o.courier || 'Not recorded') ?? { parcels: 0, amount: 0 }
    c.parcels++
    c.amount += o.toCollect
    byCourier.set(o.courier || 'Not recorded', c)
  }
  const toVerify = orders.filter((o) => o.paymentStatus === 'to_verify')
  // Advances paid for books not yet delivered.
  const advancesHeld = orders.filter((o) => (o.paid ?? 0) > 0 && (o.parcels ?? []).some((p) => p.status === 'pending' || p.status === 'packing'))
  // Money owed back to customers (cancellations, books taken back), on any order.
  const owed = (
    await payload.find({
      collection: 'orders',
      where: { refundDue: { greater_than: 0 } },
      select: ORDER_SELECT,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
  ).docs as unknown as OrderRow[]
  return {
    refundsDue: owed,
    refundsDueTotal: sum(owed, (o) => o.refundDue),
    withCouriers,
    couriers: [...byCourier.entries()].map(([name, c]) => ({ name, ...c })),
    courierTotal: sum(withCouriers, (o) => o.toCollect),
    toVerify,
    toVerifyTotal: sum(toVerify, (o) => o.payNow),
    advancesHeld,
    advancesHeldTotal: sum(advancesHeld, (o) => o.paid),
  }
}

/**
 * Stock: what is on the shelves and what it is worth, the books that have stopped selling,
 * and the ones selling fast enough to reorder.
 */
export const stockReport = async (payload: Payload, now = new Date()) => {
  const [books, lots, sales, arrivals] = await Promise.all([
    payload.find({
      collection: 'editions',
      where: { stockOnHand: { greater_than: 0 } },
      select: { title: true, authorLine: true, isbn13: true, price: true, listPrice: true, listCurrency: true, stockOnHand: true, status: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    // What the copies on the shelf cost: each lot's landed cost × the copies left in it.
    payload.find({
      collection: 'stock-lots',
      where: { remaining: { greater_than: 0 } },
      select: { edition: true, remaining: true, landedCost: true, estimated: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'stock-movements',
      where: { and: [{ reason: { equals: 'sale' } }, { createdAt: { greater_than: new Date(now.getTime() - 365 * 86400_000).toISOString() } }] },
      select: { edition: true, quantity: true, createdAt: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    // When each book's copies first arrived, so a book that has just come in is not called slow.
    payload.find({
      collection: 'stock-movements',
      where: { quantity: { greater_than: 0 } },
      select: { edition: true, createdAt: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ])
  const firstArrived = new Map<number, number>()
  for (const m of arrivals.docs) {
    const id = idOf(m.edition as number | { id: number })
    const at = new Date(m.createdAt).getTime()
    firstArrived.set(id, Math.min(firstArrived.get(id) ?? at, at))
  }
  const lotCost = new Map<number, { value: number; unknown: boolean; estimated: number }>()
  for (const l of lots.docs) {
    const id = idOf(l.edition as number | { id: number })
    const c = lotCost.get(id) ?? { value: 0, unknown: false, estimated: 0 }
    if (typeof l.landedCost === 'number') c.value += l.landedCost * l.remaining
    else c.unknown = true
    if (l.estimated) c.estimated += l.remaining
    lotCost.set(id, c)
  }

  const lastSale = new Map<number, number>()
  const sold60 = new Map<number, number>()
  for (const m of sales.docs) {
    const id = idOf(m.edition as number | { id: number })
    const at = new Date(m.createdAt).getTime()
    lastSale.set(id, Math.max(lastSale.get(id) ?? 0, at))
    if (now.getTime() - at < 60 * 86400_000) sold60.set(id, (sold60.get(id) ?? 0) - (m.quantity ?? 0))
  }
  // Released copies (cancellations) are not counted back; this is a guide, not accounts.

  const rows = books.docs.map((b) => {
    const cost = lotCost.get(b.id)
    const last = lastSale.get(b.id)
    return {
      id: b.id,
      title: b.title,
      author: b.authorLine ?? '',
      isbn: b.isbn13,
      copies: b.stockOnHand ?? 0,
      price: b.price ?? 0,
      retailValue: (b.price ?? 0) * (b.stockOnHand ?? 0),
      costValue: !cost || cost.unknown ? null : Math.round(cost.value),
      estimatedCopies: cost?.estimated ?? 0,
      lastSold: last ? dhakaDay(new Date(last)) : null,
      daysSinceSale: last ? Math.floor((now.getTime() - last) / 86400_000) : null,
      soldLast60: sold60.get(b.id) ?? 0,
      daysInStock: firstArrived.has(b.id) ? Math.floor((now.getTime() - firstArrived.get(b.id)!) / 86400_000) : null,
      published: b.status === 'published',
    }
  })

  return {
    rows: rows.sort((a, b) => a.title.localeCompare(b.title)),
    titles: rows.length,
    copies: sum(rows, (r) => r.copies),
    retailValue: sum(rows, (r) => r.retailValue),
    costValue: sum(rows, (r) => r.costValue),
    costUnknown: rows.filter((r) => r.costValue === null).length,
    estimatedCopies: sum(rows, (r) => r.estimatedCopies),
    // Here at least 90 days with nothing sold in the last 90, most money tied up first.
    slow: rows
      .filter((r) => (r.daysInStock === null || r.daysInStock >= 90) && (r.daysSinceSale === null || r.daysSinceSale >= 90))
      .sort((a, b) => b.retailValue - a.retailValue),
    // Selling at least two a month and down to the last few copies.
    reorder: rows.filter((r) => r.soldLast60 >= 4 && r.copies <= Math.ceil(r.soldLast60 / 2)).sort((a, b) => b.soldLast60 - a.soldLast60),
    unpublished: rows.filter((r) => !r.published),
  }
}

type LotAlloc = { lot: number | null; quantity: number; cost: number | null }

/**
 * What each copy of each order brought in and cost, from the stock ledger: every copy an order
 * took (less any given back) carries the landed cost of the lot it came from. Revenue is what
 * the customer paid for the book, after the order's discount, without delivery.
 */
const soldCopies = async (payload: Payload, orderWhere: object) => {
  const orders = (
    await payload.find({
      collection: 'orders',
      where: orderWhere as never,
      select: { number: true, lines: true, subtotal: true, discount: true, createdAt: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
  ).docs
  const ids = orders.map((o) => o.id)
  const moves = ids.length
    ? (
        await payload.find({
          collection: 'stock-movements',
          where: { order: { in: ids } },
          select: { order: true, edition: true, quantity: true, lots: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
      ).docs
    : []
  // Each copy's share of the price: its line price less the order's discount, spread evenly.
  const unitRevenue = new Map<string, number>()
  const titles = new Map<number, string>()
  for (const o of orders) {
    const keep = o.subtotal ? 1 - (o.discount ?? 0) / o.subtotal : 1
    for (const l of o.lines ?? []) {
      const e = idOf(l.edition as number | { id: number })
      unitRevenue.set(`${o.id}:${e}`, (l.unitPrice ?? 0) * keep)
      titles.set(e, l.title ?? `Book ${e}`)
    }
  }
  const rows: { order: number; edition: number; lot: number | null; copies: number; cost: number | null; revenue: number }[] = []
  for (const m of moves) {
    const order = idOf(m.order as number | { id: number })
    const edition = idOf(m.edition as number | { id: number })
    const sign = (m.quantity ?? 0) < 0 ? 1 : -1
    for (const a of (m.lots as LotAlloc[] | null) ?? []) {
      rows.push({ order, edition, lot: a.lot, copies: sign * a.quantity, cost: a.cost, revenue: sign * a.quantity * (unitRevenue.get(`${order}:${edition}`) ?? 0) })
    }
  }
  return { rows, titles, orders }
}

/** Profit on the books sold in a period: revenue, what the copies cost, and the difference, overall and by title. */
export const profitReport = async (payload: Payload, period: Period) => {
  const { rows, titles } = await soldCopies(payload, {
    and: [
      { createdAt: { greater_than_equal: period.from.toISOString() } },
      { createdAt: { less_than: period.to.toISOString() } },
      { status: { not_in: ['cancelled', 'returned'] } },
    ],
  })
  const byTitle = new Map<number, { id: number; title: string; copies: number; revenue: number; cost: number; unknown: number }>()
  for (const r of rows) {
    const t = byTitle.get(r.edition) ?? { id: r.edition, title: titles.get(r.edition) ?? `Book ${r.edition}`, copies: 0, revenue: 0, cost: 0, unknown: 0 }
    t.copies += r.copies
    t.revenue += r.revenue
    if (r.cost === null) t.unknown += r.copies
    else t.cost += r.copies * r.cost
    byTitle.set(r.edition, t)
  }
  const list = [...byTitle.values()]
    .filter((t) => t.copies > 0)
    .map((t) => ({ ...t, revenue: Math.round(t.revenue), cost: Math.round(t.cost), profit: Math.round(t.revenue - t.cost) }))
    .sort((a, b) => b.profit - a.profit)
  const revenue = sum(list, (t) => t.revenue)
  const cost = sum(list, (t) => t.cost)
  return {
    period,
    totals: {
      copies: sum(list, (t) => t.copies),
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      unknownCopies: sum(list, (t) => t.unknown),
    },
    byTitle: list,
  }
}

/**
 * Every delivery: when it came, how many copies came in, how many are sold and left, what they
 * cost, and the profit on the ones sold so far. Opening stock (from before lots) is one row.
 */
export const shipmentsReport = async (payload: Payload) => {
  const [lots, { rows }] = await Promise.all([
    payload.find({
      collection: 'stock-lots',
      select: { purchaseOrder: true, quantity: true, remaining: true, landedCost: true, estimated: true, receivedAt: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    soldCopies(payload, { status: { not_equals: 'cancelled' } }),
  ])
  const poIds = [...new Set(lots.docs.map((l) => (l.purchaseOrder ? idOf(l.purchaseOrder as number | { id: number }) : null)).filter((x): x is number => x !== null))]
  const pos = poIds.length
    ? (await payload.find({ collection: 'purchase-orders', where: { id: { in: poIds } }, select: { reference: true, supplier: true, receivedAt: true }, depth: 1, pagination: false, overrideAccess: true })).docs
    : []
  const poById = new Map(pos.map((p) => [p.id, p]))
  const soldByLot = new Map<number, { copies: number; revenue: number }>()
  for (const r of rows) {
    if (r.lot === null) continue
    const s = soldByLot.get(r.lot) ?? { copies: 0, revenue: 0 }
    s.copies += r.copies
    s.revenue += r.revenue
    soldByLot.set(r.lot, s)
  }
  const groups = new Map<string, { key: string; id: number | null; reference: string; supplier: string; receivedAt: string; copiesIn: number; left: number; sold: number; cost: number; revenue: number; soldCost: number; estimated: boolean }>()
  for (const l of lots.docs) {
    const po = l.purchaseOrder ? idOf(l.purchaseOrder as number | { id: number }) : null
    const key = po ? `po-${po}` : 'other'
    const p = po ? poById.get(po) : undefined
    const g = groups.get(key) ?? {
      key,
      id: po,
      reference: p?.reference ?? 'Opening stock and other additions',
      supplier: p && typeof p.supplier === 'object' ? (p.supplier?.name ?? '') : '',
      receivedAt: p?.receivedAt ?? l.receivedAt,
      copiesIn: 0,
      left: 0,
      sold: 0,
      cost: 0,
      revenue: 0,
      soldCost: 0,
      estimated: false,
    }
    const sold = soldByLot.get(l.id) ?? { copies: 0, revenue: 0 }
    g.copiesIn += l.quantity
    g.left += l.remaining
    g.sold += sold.copies
    g.cost += (l.landedCost ?? 0) * l.quantity
    g.revenue += sold.revenue
    g.soldCost += (l.landedCost ?? 0) * sold.copies
    g.estimated ||= Boolean(l.estimated)
    if (l.receivedAt < g.receivedAt) g.receivedAt = l.receivedAt
    groups.set(key, g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, cost: Math.round(g.cost), revenue: Math.round(g.revenue), profit: Math.round(g.revenue - g.soldCost) }))
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.receivedAt.localeCompare(a.receivedAt)))
}

/** Book requests and what customers searched for without finding. */
export const demandReport = async (payload: Payload, period: Period) => {
  const [requests, misses] = await Promise.all([
    payload.find({
      collection: 'requests',
      where: { createdAt: { greater_than_equal: period.from.toISOString() } },
      select: { wanted: true, status: true, createdAt: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'search-misses',
      where: { lastAt: { greater_than_equal: period.from.toISOString() } },
      sort: '-count',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const byStatus = (s: string) => requests.docs.filter((r) => r.status === s).length
  return {
    requests: requests.docs.length,
    quoted: byStatus('quoted'),
    ordered: byStatus('ordered'),
    declined: byStatus('declined'),
    open: byStatus('new'),
    searches: misses.docs.map((m) => ({ query: m.query, count: m.count ?? 0, lastAt: m.lastAt })),
  }
}

/** A table as CSV, for opening in a spreadsheet. */
export const toCsv = (headers: string[], rows: (string | number | null | undefined)[][]): string => {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    // Quote anything with separators; prefix formula-looking text so spreadsheets do not run it.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}
