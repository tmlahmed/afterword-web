import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'
import { type OrderAction, runOrderAction } from '../lib/orders/transitions'

/** POST /api/orders/:id/action  { action: 'confirm' | 'record_payment' | 'ship' | 'deliver' | 'return' | 'cancel', … } */
export const orderActionEndpoint: Endpoint = {
  path: '/:id/action',
  method: 'post',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'orders')) {
      return Response.json({ message: 'You do not have permission to change orders.' }, { status: 403 })
    }
    const id = Number(req.routeParams?.id)
    const body = ((await req.json?.().catch(() => null)) ?? {}) as OrderAction
    const allowed = ['confirm', 'record_payment', 'ship', 'deliver', 'return', 'cancel']
    if (!id || !allowed.includes(body.action)) return Response.json({ message: 'Unknown action.' }, { status: 400 })
    try {
      const by = (req.user as { name?: string; email?: string }).name ?? (req.user as { email?: string }).email ?? 'Staff'
      const order = await runOrderAction(req.payload, id, body, by)
      return Response.json({ ok: true, status: order.status, paymentStatus: order.paymentStatus })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      return Response.json({ message }, { status: 400 })
    }
  },
}
