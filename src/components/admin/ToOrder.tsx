import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { userHasRole } from '../../access/roles'
import { stockReport } from '../../lib/reports'
import { type ToOrderRow, toOrderReport } from '../../lib/toOrder'

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 12px 6px 0', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7, borderBottom: '1px solid var(--theme-elevation-150)' }
const td: React.CSSProperties = { padding: '9px 12px 9px 0', borderBottom: '1px solid var(--theme-elevation-100)', verticalAlign: 'top', fontSize: 14 }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const numTh: React.CSSProperties = { ...th, textAlign: 'right' }
const small: React.CSSProperties = { fontSize: 12, opacity: 0.7 }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' })

const Book: React.FC<{ r: ToOrderRow }> = ({ r }) => (
  <td style={td}>
    <Link href={`/admin/collections/editions/${r.id}`} style={{ fontWeight: 600 }}>
      {r.title}
    </Link>
    <div style={small}>{[r.author, r.publisher, r.isbn].filter(Boolean).join(' · ')}</div>
  </td>
)

const Orders: React.FC<{ r: ToOrderRow }> = ({ r }) => (
  <td style={{ ...td, fontSize: 13 }}>
    {r.orders.map((o, i) => (
      <span key={`${o.id}-${i}`}>
        {i ? ', ' : ''}
        <Link href={`/admin/collections/orders/${o.id}`}>{o.number}</Link>
        {o.quantity > 1 ? ` ×${o.quantity}` : ''}
        {o.confirmed ? '' : ' (not confirmed)'}
      </span>
    ))}
    <div style={small}>Waiting since {day(r.waitingSince)}</div>
  </td>
)

/**
 * "To order": the books customers are waiting for that still have to be ordered from a
 * supplier, grouped by supplier, then what is already covered, then books selling fast and
 * running low. Read-only: order them yourself, then record the purchase order.
 */
export const ToOrder = async ({ initPageResult, params, searchParams }: AdminViewServerProps) => {
  const { req, permissions, visibleEntities, locale } = initPageResult
  const user = req.user
  if (!user) redirect('/admin/login?redirect=%2Fadmin%2Fto-order')
  const allowed = userHasRole(user, 'manager', 'warehouse', 'catalogue', 'orders')

  const body = allowed
    ? await (async () => {
        const [rows, stock] = await Promise.all([toOrderReport(req.payload), stockReport(req.payload)])
        const open = rows.filter((r) => r.toOrder > 0)
        const covered = rows.filter((r) => r.toOrder === 0)
        const bySupplier = new Map<string, ToOrderRow[]>()
        for (const r of open) bySupplier.set(r.supplier || 'No supplier set', [...(bySupplier.get(r.supplier || 'No supplier set') ?? []), r])
        const copies = open.reduce((s, r) => s + r.toOrder, 0)
        return (
          <>
            <p style={{ maxWidth: '46rem', opacity: 0.8 }}>
              Books customers are waiting for (On Request, pre-orders, or stock that ran out), less what is already on purchase orders and anything free on the shelf. Order them from the
              supplier, then record the purchase order: these books then move to “Already covered”.
            </p>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{open.length}</div>
                <div style={small}>{open.length === 1 ? 'title to order' : 'titles to order'}</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{copies}</div>
                <div style={small}>{copies === 1 ? 'copy' : 'copies'}</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{new Set(rows.flatMap((r) => r.orders.map((o) => o.id))).size}</div>
                <div style={small}>orders waiting</div>
              </div>
            </div>

            {open.length ? (
              [...bySupplier.entries()].map(([supplier, list]) => (
                <section key={supplier} style={{ marginTop: '1.75rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem' }}>
                    {supplier} <span style={{ ...small, fontWeight: 400 }}>· {list.reduce((s, r) => s + r.toOrder, 0)} copies</span>
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>Book</th>
                          <th style={numTh}>Printed</th>
                          <th style={numTh}>Waiting</th>
                          <th style={numTh}>On the way</th>
                          <th style={numTh}>On shelf</th>
                          <th style={numTh}>To order</th>
                          <th style={th}>For orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.id}>
                            <Book r={r} />
                            <td style={num}>{r.printed || '—'}</td>
                            <td style={num}>
                              {r.waiting}
                              {r.unconfirmed ? <div style={small}>+{r.unconfirmed} unconfirmed</div> : null}
                            </td>
                            <td style={num}>
                              {r.onOrder || '—'}
                              {r.purchaseOrders.map((p) => (
                                <div key={p.id} style={small}>
                                  <Link href={`/admin/collections/purchase-orders/${p.id}`}>{p.reference}</Link>
                                </div>
                              ))}
                            </td>
                            <td style={num}>{r.free || '—'}</td>
                            <td style={{ ...num, fontWeight: 700, fontSize: 16 }}>{r.toOrder}</td>
                            <Orders r={r} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            ) : (
              <p style={{ padding: '1rem', border: '1px dashed var(--theme-elevation-200)', borderRadius: 4, opacity: 0.8 }}>Nothing to order. Every waiting customer is covered.</p>
            )}

            {covered.length ? (
              <section style={{ marginTop: '2.5rem' }}>
                <h3 style={{ margin: '0 0 0.25rem' }}>Already covered</h3>
                <p style={{ ...small, margin: '0 0 0.5rem' }}>On a purchase order on its way, on the shelf, or only on orders not yet confirmed.</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Book</th>
                        <th style={numTh}>Waiting</th>
                        <th style={numTh}>On the way</th>
                        <th style={numTh}>On shelf</th>
                        <th style={th}>For orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {covered.map((r) => (
                        <tr key={r.id}>
                          <Book r={r} />
                          <td style={num}>
                            {r.waiting}
                            {r.unconfirmed ? <div style={small}>+{r.unconfirmed} unconfirmed</div> : null}
                          </td>
                          <td style={num}>
                            {r.onOrder || '—'}
                            {r.purchaseOrders.map((p) => (
                              <div key={p.id} style={small}>
                                <Link href={`/admin/collections/purchase-orders/${p.id}`}>{p.reference}</Link>
                              </div>
                            ))}
                          </td>
                          <td style={num}>{r.free || '—'}</td>
                          <Orders r={r} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section style={{ marginTop: '2.5rem' }}>
              <h3 style={{ margin: '0 0 0.25rem' }}>Selling fast, running low</h3>
              <p style={{ ...small, margin: '0 0 0.5rem' }}>Four or more sold in the last 60 days, and the copies left would last about a month or less.</p>
              {stock.reorder.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Book</th>
                      <th style={numTh}>Sold in 60 days</th>
                      <th style={numTh}>Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.reorder.slice(0, 30).map((b) => (
                      <tr key={b.id}>
                        <td style={td}>
                          <Link href={`/admin/collections/editions/${b.id}`} style={{ fontWeight: 600 }}>
                            {b.title}
                          </Link>
                          <div style={small}>{b.author}</div>
                        </td>
                        <td style={num}>{b.soldLast60}</td>
                        <td style={num}>{b.copies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ opacity: 0.7 }}>Nothing is running low.</p>
              )}
            </section>
          </>
        )
      })()
    : <p>This list is for the order desk, warehouse, catalogue and managers.</p>

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <h1 style={{ marginTop: '1.5rem' }}>To order from suppliers</h1>
        {body}
      </Gutter>
    </DefaultTemplate>
  )
}
