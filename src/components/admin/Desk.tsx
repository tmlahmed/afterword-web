import Link from 'next/link'
import type { Payload } from 'payload'
import React from 'react'

const tile: React.CSSProperties = {
  display: 'block',
  padding: '1rem 1.25rem',
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  borderRadius: 4,
  textDecoration: 'none',
  color: 'inherit',
}

/** Twenty-four hours before now. Kept outside the component: a server component renders once per request. */
const dayAgo = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString()

/** The daily desk: what needs doing today, shown at the top of the admin's first screen. */
export const Desk = async ({ payload }: { payload: Payload }) => {
  const count = async (collection: 'orders' | 'requests' | 'editions' | 'reviews', where: object) =>
    (await payload.count({ collection, where: where as never, overrideAccess: true })).totalDocs

  const since = dayAgo()
  const [toConfirm, toVerify, toPack, awaiting, shipped, requests, lowStock, today, reviews] = await Promise.all([
    count('orders', { status: { equals: 'placed' } }),
    count('orders', { and: [{ status: { equals: 'placed' } }, { paymentStatus: { equals: 'to_verify' } }] }),
    count('orders', { status: { equals: 'packing' } }),
    count('orders', { status: { equals: 'awaiting_stock' } }),
    count('orders', { status: { equals: 'shipped' } }),
    count('requests', { status: { equals: 'new' } }),
    count('editions', { and: [{ status: { equals: 'published' } }, { stockOnHand: { greater_than: 0 } }, { stockOnHand: { less_than_equal: 1 } }] }),
    payload.find({ collection: 'orders', where: { and: [{ createdAt: { greater_than: since } }, { status: { not_equals: 'cancelled' } }] }, depth: 0, pagination: false, select: { total: true }, overrideAccess: true }),
    count('reviews', { status: { equals: 'pending' } }),
  ])
  const sales = today.docs.reduce((sum, o) => sum + (o.total ?? 0), 0)
  const orders = (status: string) => `/admin/collections/orders?where[status][equals]=${status}`

  const tiles: [number | string, string, string, string][] = [
    [toConfirm, 'orders to confirm', toVerify ? `${toVerify} with a payment to verify` : 'Call or message, then confirm', orders('placed')],
    [toPack, 'orders to pack', 'Pick, pack and hand to the courier', orders('packing')],
    [shipped, 'with couriers', 'Mark delivered or returned', orders('shipped')],
    [awaiting, 'waiting for stock', 'Released when a delivery is received', orders('awaiting_stock')],
    [requests, 'book requests to quote', 'Find the book and reply', '/admin/collections/requests?where[status][equals]=new'],
    [reviews, 'reviews to check', 'Read, then publish or not', '/admin/collections/reviews?where[status][equals]=pending'],
    [lowStock, 'books down to the last copy', 'Consider reordering', '/admin/collections/editions?where[stockOnHand][less_than_equal]=1&where[stockOnHand][greater_than]=0'],
  ]

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ marginBottom: '0.25rem' }}>Today’s desk</h2>
      <p style={{ margin: '0 0 1rem', opacity: 0.75 }}>
        Last 24 hours: {today.docs.length} {today.docs.length === 1 ? 'order' : 'orders'}, ৳{sales.toLocaleString('en-IN')}.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.75rem' }}>
        {tiles.map(([n, label, hint, href]) => (
          <Link key={label} href={href} style={tile}>
            <div style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1.1 }}>{n}</div>
            <div style={{ fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '0.8125rem', opacity: 0.7 }}>{hint}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}
