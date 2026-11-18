import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'
import { bookWithPathao, checkPathaoParcel } from '../lib/courier'
import { pathaoMode } from '../lib/courier/pathao'
import { type OrderAction, runOrderAction } from '../lib/orders/transitions'

type CourierAction = { action: 'book_pathao'; parcel?: number } | { action: 'check_courier'; parcel: number }

/**
 * POST /api/orders/:id/action
 * { action: 'confirm' | 'record_payment' | 'ship' | 'unship' | 'deliver' | 'return' | 'cancel' | 'book_pathao' | 'check_courier', … }
 */
export const orderActionEndpoint: Endpoint = {
  path: '/:id/action',
  method: 'post',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'orders')) {
      return Response.json({ message: 'You do not have permission to change orders.' }, { status: 403 })
    }
    const id = Number(req.routeParams?.id)
    const body = ((await req.json?.().catch(() => null)) ?? {}) as OrderAction | CourierAction
    const allowed = ['confirm', 'record_payment', 'ship', 'unship', 'deliver', 'return', 'cancel', 'book_pathao', 'check_courier']
    if (!id || !allowed.includes(body.action)) return Response.json({ message: 'Unknown action.' }, { status: 400 })
    try {
      const by = (req.user as { name?: string; email?: string }).name ?? (req.user as { email?: string }).email ?? 'Staff'
      if (body.action === 'book_pathao') {
        const order = await bookWithPathao(req.payload, id, body.parcel, by)
        return Response.json({ ok: true, status: order.status })
      }
      if (body.action === 'check_courier') {
        const message = await checkPathaoParcel(req.payload, id, Number(body.parcel), by)
        return Response.json({ ok: true, message })
      }
      const order = await runOrderAction(req.payload, id, body as OrderAction, by)
      return Response.json({ ok: true, status: order.status, paymentStatus: order.paymentStatus })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      return Response.json({ message }, { status: 400 })
    }
  },
}

/** GET /api/orders/courier-mode: whether Pathao is connected, for the order screen. */
export const courierModeEndpoint: Endpoint = {
  path: '/courier-mode',
  method: 'get',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'orders', 'warehouse')) return Response.json({ message: 'Not allowed.' }, { status: 403 })
    return Response.json({ pathao: pathaoMode() })
  },
}
