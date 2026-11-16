import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'

/**
 * POST /api/purchase-orders/:id/receive
 * Adds every line to stock. Waiting customer orders are released automatically by the stock ledger.
 */
export const receivePurchaseOrderEndpoint: Endpoint = {
  path: '/:id/receive',
  method: 'post',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'warehouse')) {
      return Response.json({ message: 'You do not have permission to receive stock.' }, { status: 403 })
    }
    const id = Number(req.routeParams?.id)
    const po = await req.payload.findByID({ collection: 'purchase-orders', id, depth: 0, disableErrors: true })
    if (!po) return Response.json({ message: 'Purchase order not found.' }, { status: 404 })
    if (po.status === 'received') return Response.json({ message: 'This delivery has already been received.' }, { status: 400 })

    let copies = 0
    for (const line of po.lines ?? []) {
      const edition = typeof line.edition === 'object' ? line.edition.id : line.edition
      await req.payload.create({
        collection: 'stock-movements',
        data: { edition, quantity: line.quantity, reason: 'received', note: `Purchase order ${po.reference}` },
        depth: 0,
        overrideAccess: true,
        user: req.user,
      })
      copies += line.quantity
    }
    await req.payload.update({ collection: 'purchase-orders', id, data: { status: 'received', receivedAt: new Date().toISOString() }, depth: 0, overrideAccess: true })
    return Response.json({ ok: true, message: `${copies} ${copies === 1 ? 'copy' : 'copies'} added to stock. Waiting orders have been released.` })
  },
}
