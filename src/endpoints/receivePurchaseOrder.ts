import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'
import { estimateCost, expensesTotal, landedCosts } from '../lib/lots'

const SYMBOL: Record<string, string> = { INR: '₹', GBP: '£', USD: '$', EUR: '€', BDT: '৳' }
const printed = (price?: number | null, currency?: string | null) => (price ? `${SYMBOL[currency ?? ''] ?? `${currency} `}${price}` : 'another price')

/**
 * POST /api/purchase-orders/:id/receive
 * Each line becomes a stock lot at its landed cost (supplier price at the rate paid, plus its
 * share of the shipment's costs) and is added to stock. Waiting customer orders are released
 * by the stock ledger. When older copies with a different printed price are still on the
 * shelf, the new copies are to be marked with their lot code, so the older ones go out first.
 */
export const receivePurchaseOrderEndpoint: Endpoint = {
  path: '/:id/receive',
  method: 'post',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'warehouse')) {
      return Response.json({ message: 'You do not have permission to receive stock.' }, { status: 403 })
    }
    const { payload } = req
    const id = Number(req.routeParams?.id)
    const po = await payload.findByID({ collection: 'purchase-orders', id, depth: 0, disableErrors: true })
    if (!po) return Response.json({ message: 'Purchase order not found.' }, { status: 404 })
    if (po.status === 'received') return Response.json({ message: 'This delivery has already been received.' }, { status: 400 })

    const foreign = po.currency && po.currency !== 'BDT'
    const priced = (po.lines ?? []).some((l) => typeof l.unitCost === 'number')
    if (foreign && priced && !po.exchangeRate) {
      return Response.json({ message: `Enter the exchange rate you paid for ${po.currency} first, then save.` }, { status: 400 })
    }
    const rate = foreign ? Number(po.exchangeRate ?? 0) : 1
    const pricing = await payload.findGlobal({ slug: 'pricing', depth: 0, overrideAccess: true })
    const costs = landedCosts(po.lines ?? [], rate, expensesTotal(po.expenses))
    const now = new Date().toISOString()

    let copies = 0
    const marks: string[] = []
    const lines = [...(po.lines ?? [])]
    for (const [i, line] of lines.entries()) {
      const edition = typeof line.edition === 'object' ? line.edition.id : line.edition
      const [book, onShelf] = await Promise.all([
        payload.findByID({ collection: 'editions', id: edition, depth: 0, overrideAccess: true, select: { title: true, listPrice: true, listCurrency: true, price: true } }),
        payload.find({ collection: 'stock-lots', where: { and: [{ edition: { equals: edition } }, { remaining: { greater_than: 0 } }] }, depth: 0, pagination: false, overrideAccess: true }),
      ])
      const listPrice = line.listPrice || book.listPrice || null
      const listCurrency = line.listPrice ? (po.currency ?? book.listCurrency) : book.listCurrency
      const known = costs[i].landedCost
      const lot = await payload.create({
        collection: 'stock-lots',
        data: {
          edition,
          purchaseOrder: id,
          quantity: line.quantity,
          remaining: line.quantity,
          receivedAt: now,
          listPrice,
          listCurrency,
          unitCost: costs[i].unitCost,
          landedCost: known ?? estimateCost({ listPrice, listCurrency, price: book.price }, pricing),
          estimated: known === null,
        },
        depth: 0,
        overrideAccess: true,
      })
      await payload.create({
        collection: 'stock-movements',
        data: { edition, quantity: line.quantity, reason: 'received', note: `Purchase order ${po.reference}`, lots: [{ lot: lot.id, quantity: line.quantity, cost: lot.landedCost ?? null }] },
        depth: 0,
        overrideAccess: true,
        user: req.user,
      })
      const older = onShelf.docs.find((l) => l.listPrice !== listPrice || l.listCurrency !== listCurrency)
      if (older) {
        marks.push(
          `${book.title}: write ${lot.code} inside the back cover of these ${line.quantity} ${line.quantity === 1 ? 'copy' : 'copies'}. Older copies printed ${printed(older.listPrice, older.listCurrency)} are still in stock and go out first.`,
        )
      }
      lines[i] = { ...line, landedCost: lot.landedCost ?? null }
      copies += line.quantity
    }
    await payload.update({
      collection: 'purchase-orders',
      id,
      data: { status: 'received', receivedAt: now, lines, receivingNote: marks.join('\n') || null },
      depth: 0,
      overrideAccess: true,
    })
    const message = `${copies} ${copies === 1 ? 'copy' : 'copies'} added to stock. Waiting orders have been released.`
    return Response.json({ ok: true, message, marks })
  },
}
