import { randomBytes } from 'node:crypto'

import type { CollectionConfig, Endpoint, FieldAccess, Payload } from 'payload'

import { allow, nobody, publishedOrStaff, userHasRole } from '../access/roles'
import { toCsv } from '../lib/reports'

const idOf = (v: unknown): number | undefined =>
  typeof v === 'object' && v !== null ? (v as { id: number }).id : typeof v === 'number' ? v : undefined
const staffOnly: FieldAccess = ({ req }) => Boolean(req.user)

// --- Reward points ---------------------------------------------------------------

/** A customer's balance is the sum of their entries, the same way stock is the sum of its movements. */
export const recomputePoints = async (payload: Payload, customerId: number, req?: Parameters<Payload['find']>[0]['req']) => {
  const entries = await payload.find({
    collection: 'reward-entries',
    where: { customer: { equals: customerId } },
    select: { points: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const balance = entries.docs.reduce((sum, e) => sum + (e.points ?? 0), 0)
  await payload.update({ collection: 'customers', id: customerId, data: { rewardPoints: balance }, depth: 0, overrideAccess: true, req })
  return balance
}

export const RewardEntries: CollectionConfig = {
  slug: 'reward-entries',
  labels: { singular: 'Reward points entry', plural: 'Reward points' },
  admin: {
    group: 'Orders',
    defaultColumns: ['customer', 'points', 'reason', 'order', 'createdAt'],
    description: 'Every point earned or spent. To give or take points by hand, add an entry; entries cannot be edited.',
  },
  access: {
    read: allow('manager', 'orders'),
    create: allow('manager'),
    update: nobody,
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user) data.recordedBy = req.user.id
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        const customerId = idOf(doc.customer)
        if (customerId) await recomputePoints(req.payload, customerId, req)
        return doc
      },
    ],
  },
  fields: [
    { name: 'customer', type: 'relationship', relationTo: 'customers', required: true, index: true },
    {
      name: 'points',
      type: 'number',
      required: true,
      admin: { description: 'Points added (positive) or taken away (negative).' },
      validate: (value: number | null | undefined) => (Number.isInteger(value) && value !== 0 ? true : 'Enter a whole number other than zero.'),
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      defaultValue: 'adjustment',
      options: [
        { label: 'Earned on a delivered order', value: 'earned' },
        { label: 'Spent on an order', value: 'spent' },
        { label: 'Given back (order cancelled or returned)', value: 'refunded' },
        { label: 'Given or taken by staff', value: 'adjustment' },
      ],
    },
    { name: 'order', type: 'relationship', relationTo: 'orders' },
    { name: 'note', type: 'text' },
    { name: 'recordedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true, position: 'sidebar' } },
  ],
}

// --- Reviews ----------------------------------------------------------------------

/** Average rating and count of published reviews, kept on the book for pages and search engines. */
const refreshRating = async (payload: Payload, editionId: number) => {
  const published = await payload.find({
    collection: 'reviews',
    where: { and: [{ edition: { equals: editionId } }, { status: { equals: 'published' } }] },
    select: { rating: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const count = published.docs.length
  const average = count ? Math.round((published.docs.reduce((s, r) => s + (r.rating ?? 0), 0) / count) * 10) / 10 : null
  await payload.update({ collection: 'editions', id: editionId, data: { ratingAverage: average, ratingCount: count }, depth: 0, overrideAccess: true })
}

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  labels: { singular: 'Review', plural: 'Reviews' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['edition', 'rating', 'title', 'displayName', 'status', 'createdAt'],
    description: 'Reviews from customers who bought the book. Nothing appears in the shop until it is published here.',
  },
  defaultSort: '-createdAt',
  access: {
    read: publishedOrStaff,
    create: nobody, // written by customers through the shop, never through the API
    update: allow('manager', 'catalogue', 'writer'),
    delete: allow('manager'),
  },
  hooks: {
    afterChange: [
      ({ doc, previousDoc, req }) => {
        const editionId = idOf(doc.edition)
        if (editionId && (doc.status !== previousDoc?.status || doc.rating !== previousDoc?.rating)) {
          setTimeout(() => void refreshRating(req.payload, editionId).catch(() => undefined), 200)
        }
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req }) => {
        const editionId = idOf(doc.edition)
        if (editionId) setTimeout(() => void refreshRating(req.payload, editionId).catch(() => undefined), 200)
      },
    ],
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Waiting to be checked', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Not published', value: 'rejected' },
      ],
      admin: { position: 'sidebar', description: 'Publish reviews that are about the book. Disagreeing with us is fine; abuse, spoilers in the title and advertising are not.' },
    },
    { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, index: true, label: 'Book', admin: { readOnly: true } },
    { name: 'rating', type: 'number', required: true, min: 1, max: 5, admin: { readOnly: true } },
    { name: 'title', type: 'text', required: true, maxLength: 90 },
    { name: 'body', type: 'textarea', required: true, maxLength: 2000 },
    { name: 'displayName', type: 'text', required: true, label: 'Shown as', admin: { description: 'First name and initial, as the customer chose.' } },
    { name: 'reply', type: 'textarea', label: 'Reply from the shop', admin: { description: 'Optional. Shown under the review.' } },
    { name: 'customer', type: 'relationship', relationTo: 'customers', required: true, access: { read: staffOnly }, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'order', type: 'relationship', relationTo: 'orders', access: { read: staffOnly }, admin: { readOnly: true, position: 'sidebar', description: 'The delivered order the book came in.' } },
  ],
}

// --- Newsletter -------------------------------------------------------------------

export const newSubscriberToken = () => randomBytes(18).toString('hex')

/** GET /api/subscribers/export.csv — everyone subscribed, for the email service. Managers only. */
const exportSubscribers: Endpoint = {
  path: '/export.csv',
  method: 'get',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager')) return Response.json({ message: 'Only managers can download the list.' }, { status: 403 })
    const subs = await req.payload.find({
      collection: 'subscribers',
      where: { status: { equals: 'subscribed' } },
      sort: 'createdAt',
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const csv = toCsv(
      ['email', 'name', 'subscribed_at', 'source'],
      subs.docs.map((s) => [s.email, s.name, s.consentAt ?? s.createdAt, s.source]),
    )
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="afterword-newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  },
}

export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  labels: { singular: 'Newsletter subscriber', plural: 'Newsletter subscribers' },
  admin: {
    useAsTitle: 'email',
    group: 'Content',
    defaultColumns: ['email', 'name', 'status', 'source', 'createdAt'],
    description: 'People who asked for the newsletter. Download the list (managers) at /api/subscribers/export.csv and import it into your email service.',
    components: { beforeListTable: ['/components/admin/SubscribersExport#SubscribersExport'] },
  },
  access: {
    read: allow('manager', 'writer'),
    create: nobody,
    update: allow('manager'),
    delete: allow('manager'),
  },
  endpoints: [exportSubscribers],
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'subscribed',
      index: true,
      options: [
        { label: 'Subscribed', value: 'subscribed' },
        { label: 'Unsubscribed', value: 'unsubscribed' },
      ],
    },
    {
      name: 'source',
      type: 'select',
      options: [
        { label: 'Sign-up form', value: 'form' },
        { label: 'At checkout', value: 'checkout' },
      ],
      admin: { readOnly: true },
    },
    { name: 'consentAt', type: 'date', label: 'Agreed on', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'unsubscribedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'token', type: 'text', unique: true, index: true, admin: { hidden: true }, access: { read: staffOnly } },
  ],
}
