import type { CollectionConfig, Endpoint, PayloadRequest } from 'payload'

import { allow, nobody, ROLE_OPTIONS, userHasRole } from '../access/roles'

const isStaff = (req: PayloadRequest) => Boolean(req.user && req.user.collection === 'users')

/** Can this person see an alert meant for these roles? Owners and managers see them all. */
const sees = (user: unknown, audience: string[] | null | undefined) =>
  userHasRole(user, 'manager') || (audience ?? []).some((role) => userHasRole(user, role as never))

/** GET /api/notifications/me/feed — the latest alerts this person may see, and how many are new to them. */
const feed: Endpoint = {
  path: '/me/feed',
  method: 'get',
  handler: async (req) => {
    if (!isStaff(req)) return Response.json({ message: 'Sign in first.' }, { status: 401 })
    const seenAt = (req.user as { notificationsSeenAt?: string | null }).notificationsSeenAt ?? null
    const latest = await req.payload.find({ collection: 'notifications', sort: '-createdAt', limit: 80, depth: 0, overrideAccess: true })
    const mine = latest.docs.filter((n) => sees(req.user, n.audience))
    return Response.json({
      seenAt,
      unread: mine.filter((n) => !seenAt || n.createdAt > seenAt).length,
      items: mine.slice(0, 25).map((n) => ({ id: n.id, kind: n.kind, title: n.title, detail: n.detail, link: n.link, createdAt: n.createdAt })),
    })
  },
}

/** POST /api/notifications/me/seen — this person has looked at their alerts. */
const seen: Endpoint = {
  path: '/me/seen',
  method: 'post',
  handler: async (req) => {
    if (!isStaff(req)) return Response.json({ message: 'Sign in first.' }, { status: 401 })
    const at = new Date().toISOString()
    await req.payload.update({ collection: 'users', id: req.user!.id, data: { notificationsSeenAt: at }, depth: 0, overrideAccess: true })
    return Response.json({ ok: true, seenAt: at })
  },
}

/**
 * Alerts for the staff: new orders, payments to check, book requests, reviews, books arrived for
 * waiting orders, replacements to send. Shown under the bell at the top of the admin; written
 * by the shop itself, never by hand. Each person sees the ones meant for their roles.
 */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'Alert', plural: 'Alerts' },
  admin: { hidden: true, useAsTitle: 'title', defaultColumns: ['title', 'kind', 'createdAt'] },
  defaultSort: '-createdAt',
  access: { read: allow('manager'), create: nobody, update: nobody, delete: allow('manager') },
  endpoints: [feed, seen],
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Order', value: 'order' },
        { label: 'Payment', value: 'payment' },
        { label: 'Book request', value: 'request' },
        { label: 'Review', value: 'review' },
        { label: 'Stock', value: 'stock' },
        { label: 'Refund', value: 'refund' },
      ],
    },
    { name: 'title', type: 'text', required: true },
    { name: 'detail', type: 'text' },
    { name: 'link', type: 'text' },
    { name: 'audience', type: 'select', hasMany: true, options: ROLE_OPTIONS.map((r) => ({ label: r.value, value: r.value })) },
  ],
}
