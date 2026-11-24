import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import type { AdminViewServerProps, Payload } from 'payload'
import React from 'react'

import { userHasRole } from '../../access/roles'
import { ORDER_STATUSES } from '../../collections/commerce'
import { moneyReport, periodFrom, salesReport, stockReport, type Period } from '../../lib/reports'
import { toOrderReport } from '../../lib/toOrder'
import { Icon, type IconName } from './icons'

const taka = (n: number | null | undefined) => `৳${Math.round(n ?? 0).toLocaleString('en-IN')}`
const STATUS_LABEL: Record<string, string> = {
  ...Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s.label])),
  placed: 'To confirm',
}

const DHAKA = 'Asia/Dhaka'
const greeting = (now: Date) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: DHAKA }).format(now))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: DHAKA })
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const ago = (iso: string, now: Date) => {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: DHAKA })
}

/** "▲ 12%" against the period before, or nothing when there is nothing to compare with. */
const Change: React.FC<{ now: number; before: number }> = ({ now, before }) => {
  if (!before) return now ? <span className="aw-change is-up">New</span> : null
  const pct = Math.round(((now - before) / before) * 100)
  if (!pct) return <span className="aw-change">Same as before</span>
  return (
    <span className={`aw-change ${pct > 0 ? 'is-up' : 'is-down'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  )
}

type Todo = { n: number; label: string; hint: string; href: string; icon: IconName; urgent?: boolean }

/** What is waiting for someone: only the lists with something in them. */
const todos = async (payload: Payload, can: (slug: string) => boolean): Promise<Todo[]> => {
  const count = async (collection: 'orders' | 'requests' | 'editions' | 'reviews', where: object) =>
    can(collection) ? (await payload.count({ collection, where: where as never, overrideAccess: true })).totalDocs : 0
  const [toConfirm, toVerify, toPack, shipped, awaiting, requests, reviews, lastCopy, flagged, refunds, toOrder] = await Promise.all([
    count('orders', { status: { equals: 'placed' } }),
    count('orders', { and: [{ status: { in: ['placed', 'awaiting_stock', 'packing'] } }, { paymentStatus: { equals: 'to_verify' } }] }),
    count('orders', { status: { equals: 'packing' } }),
    count('orders', { status: { equals: 'shipped' } }),
    count('orders', { status: { equals: 'awaiting_stock' } }),
    count('requests', { status: { equals: 'new' } }),
    count('reviews', { status: { equals: 'pending' } }),
    count('editions', { and: [{ status: { equals: 'published' } }, { stockOnHand: { equals: 1 } }] }),
    count('orders', { and: [{ status: { equals: 'placed' } }, { risk: { in: ['check', 'high'] } }] }),
    count('orders', { refundDue: { greater_than: 0 } }),
    can('purchase-orders') || can('orders') ? toOrderReport(payload).then((rows) => rows.filter((r) => r.toOrder > 0).length) : 0,
  ])
  const orders = (where: string) => `/admin/collections/orders?${where}`
  const list: Todo[] = [
    {
      n: toConfirm,
      label: toConfirm === 1 ? 'order to confirm' : 'orders to confirm',
      hint: flagged ? `${flagged} flagged: call before confirming` : 'Call or message, then confirm',
      href: orders('where[status][equals]=placed'),
      icon: 'orders',
      urgent: true,
    },
    { n: refunds, label: refunds === 1 ? 'refund to pay' : 'refunds to pay', hint: 'Pay back, then record it on the order', href: orders('where[refundDue][greater_than]=0'), icon: 'wallet', urgent: true },
    { n: toVerify, label: toVerify === 1 ? 'payment to check' : 'payments to check', hint: 'bKash or bank transfer sent', href: orders('where[paymentStatus][equals]=to_verify'), icon: 'wallet', urgent: true },
    { n: toPack, label: 'to pack', hint: 'Pick, pack and book the courier', href: orders('where[status][equals]=packing'), icon: 'orders' },
    { n: requests, label: requests === 1 ? 'book request' : 'book requests', hint: 'Find the book and quote', href: '/admin/collections/requests?where[status][equals]=new', icon: 'requests' },
    { n: reviews, label: reviews === 1 ? 'review to read' : 'reviews to read', hint: 'Publish or hide', href: '/admin/collections/reviews?where[status][equals]=pending', icon: 'reviews' },
    { n: shipped, label: 'with couriers', hint: 'Out for delivery', href: orders('where[status][equals]=shipped'), icon: 'purchases' },
    { n: awaiting, label: 'waiting for stock', hint: 'Go out when the books arrive', href: orders('where[status][equals]=awaiting_stock'), icon: 'clock' },
    { n: toOrder, label: toOrder === 1 ? 'book to order' : 'books to order', hint: 'For customers waiting: see To order', href: '/admin/to-order', icon: 'clock' },
    { n: lastCopy, label: lastCopy === 1 ? 'book on its last copy' : 'books on their last copy', hint: 'Reorder if it sells', href: '/admin/collections/editions?where[stockOnHand][equals]=1&where[status][equals]=published', icon: 'books' },
  ]
  return list.filter((t) => t.n > 0)
}

const before = (p: Period): Period => {
  const span = p.to.getTime() - p.from.getTime()
  return { key: 'before', label: 'Before', from: new Date(p.from.getTime() - span), to: p.from }
}

/**
 * The admin's first screen: what needs doing, how the shop is selling, the latest orders and
 * which books are moving. Money is shown to owners and managers; everyone sees the work
 * their role covers. The detail lives on the Reports page.
 */
export const Dashboard = async ({ initPageResult }: AdminViewServerProps) => {
  const { req, visibleEntities } = initPageResult
  const { payload, user } = req
  const now = new Date()
  const can = (slug: string) => visibleEntities.collections.includes(slug as never)
  const seesMoney = userHasRole(user, 'manager')
  const seesOrders = can('orders')
  const seesStock = userHasRole(user, 'manager', 'warehouse', 'catalogue')

  const month = periodFrom('30d', now)
  const [waiting, sales, earlier, money, stock, latest] = await Promise.all([
    todos(payload, can),
    seesMoney ? salesReport(payload, month) : null,
    seesMoney ? salesReport(payload, before(month)) : null,
    seesMoney ? moneyReport(payload) : null,
    seesStock ? stockReport(payload, now) : null,
    seesOrders
      ? payload.find({
          collection: 'orders',
          sort: '-createdAt',
          limit: 8,
          depth: 0,
          select: { number: true, status: true, total: true, contactName: true, createdAt: true, paymentStatus: true },
          overrideAccess: true,
        })
      : null,
  ])

  // Today, the last 7 days and the last 30, each against the same length of time before it.
  const days = sales?.days ?? []
  const add = (list: typeof days) => list.reduce((a, d) => ({ revenue: a.revenue + d.revenue, orders: a.orders + d.orders }), { revenue: 0, orders: 0 })
  const today = add(days.slice(-1))
  const yesterday = add(days.slice(-2, -1))
  const week = add(days.slice(-7))
  const weekBefore = add(days.slice(-14, -7))
  const busiest = Math.max(1, ...days.map((d) => d.revenue))

  const name = (user as { name?: string } | null)?.name?.split(' ')[0]
  const canAdd = (slug: string) => can(slug)

  return (
    <Gutter className="aw-dash">
      <header className="aw-dash__head">
        <div>
          <h1>
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h1>
          <p>{longDate(now)}</p>
        </div>
        <div className="aw-dash__actions">
          {canAdd('editions') ? (
            <Link href="/admin/collections/editions/create" className="aw-btn aw-btn--primary">
              <Icon name="plus" size={16} /> Add a book
            </Link>
          ) : null}
          {canAdd('purchase-orders') ? (
            <Link href="/admin/collections/purchase-orders?where[status][equals]=ordered" className="aw-btn">
              <Icon name="purchases" size={16} /> Receive stock
            </Link>
          ) : null}
          {seesOrders ? (
            <Link href="/admin/collections/orders" className="aw-btn">
              <Icon name="orders" size={16} /> Orders
            </Link>
          ) : null}
          <a href="/" target="_blank" rel="noreferrer" className="aw-btn">
            <Icon name="external" size={16} /> View the shop
          </a>
        </div>
      </header>

      <section aria-labelledby="todo-title">
        <div className="aw-dash__title">
          <h2 id="todo-title">Needs attention</h2>
        </div>
        {waiting.length ? (
          <div className="aw-todo">
            {waiting.map((t) => (
              <Link key={t.label} href={t.href} className={`aw-todo__item${t.urgent ? ' is-urgent' : ''}`}>
                <span className="aw-todo__icon">
                  <Icon name={t.icon} />
                </span>
                <span>
                  <span className="aw-todo__n">{t.n}</span>
                  <span className="aw-todo__label"> {t.label}</span>
                  <span className="aw-todo__hint" style={{ display: 'block' }}>
                    {t.hint}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="aw-clear">
            <Icon name="check" size={20} />
            All clear. Nothing is waiting for you right now.
          </div>
        )}
      </section>

      {sales && earlier ? (
        <section aria-labelledby="sales-title">
          <div className="aw-dash__title">
            <h2 id="sales-title">Sales</h2>
            <Link href="/admin/reports">Full reports →</Link>
          </div>
          <div className="aw-stats">
            <div className="aw-card aw-stat">
              <div className="aw-stat__label">Today</div>
              <div className="aw-stat__value">{taka(today.revenue)}</div>
              <div className="aw-stat__sub">
                <span>
                  {today.orders} {today.orders === 1 ? 'order' : 'orders'}
                </span>
                <span>
                  Yesterday {taka(yesterday.revenue)}
                </span>
              </div>
            </div>
            <div className="aw-card aw-stat">
              <div className="aw-stat__label">Last 7 days</div>
              <div className="aw-stat__value">{taka(week.revenue)}</div>
              <div className="aw-stat__sub">
                <span>
                  {week.orders} {week.orders === 1 ? 'order' : 'orders'}
                </span>
                <Change now={week.revenue} before={weekBefore.revenue} />
              </div>
            </div>
            <div className="aw-card aw-stat">
              <div className="aw-stat__label">Last 30 days</div>
              <div className="aw-stat__value">{taka(sales.totals.revenue)}</div>
              <div className="aw-stat__sub">
                <span>
                  {sales.totals.orders} orders · avg {taka(sales.totals.averageOrder)}
                </span>
                <Change now={sales.totals.revenue} before={earlier.totals.revenue} />
              </div>
            </div>
          </div>

          <div className="aw-card" style={{ marginTop: 10 }}>
            <div className="aw-stat__label">Takings each day, last 30 days</div>
            <div className="aw-chart" role="img" aria-label={`Daily takings over the last 30 days; the busiest day was ${taka(busiest)}`}>
              <div className="aw-chart__bars">
                {days.map((d) => (
                  <div
                    key={d.day}
                    title={`${shortDay(d.day)}: ${taka(d.revenue)}, ${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`}
                    className={`aw-chart__bar${d.revenue ? '' : ' is-empty'}`}
                    style={{ height: `${d.revenue ? Math.max(4, (d.revenue / busiest) * 100) : 2}%` }}
                  />
                ))}
              </div>
              <div className="aw-chart__axis">
                <span>{days[0] ? shortDay(days[0].day) : ''}</span>
                <span>Busiest day {taka(busiest === 1 ? 0 : busiest)}</span>
                <span>Today</span>
              </div>
            </div>
            {money ? (
              <div className="aw-money">
                <div className="aw-stat">
                  <div className="aw-stat__label">Cash with couriers</div>
                  <div className="aw-stat__value" style={{ fontSize: 20 }}>
                    {taka(money.courierTotal)}
                  </div>
                  <div className="aw-stat__sub">
                    {money.withCouriers.length} {money.withCouriers.length === 1 ? 'parcel' : 'parcels'} out
                  </div>
                </div>
                <div className="aw-stat">
                  <div className="aw-stat__label">Advances to check</div>
                  <div className="aw-stat__value" style={{ fontSize: 20 }}>
                    {taka(money.toVerifyTotal)}
                  </div>
                  <div className="aw-stat__sub">
                    {money.toVerify.length} {money.toVerify.length === 1 ? 'order' : 'orders'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {latest || sales || stock ? (
        <div className="aw-split">
          {latest ? (
            <section aria-labelledby="latest-title" className="aw-card">
              <div className="aw-dash__title">
                <h2 id="latest-title">Latest orders</h2>
                <Link href="/admin/collections/orders">All orders →</Link>
              </div>
              {latest.docs.length ? (
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.docs.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/admin/collections/orders/${o.id}`}>{o.number ?? `#${o.id}`}</Link>
                          <div className="muted">{ago(o.createdAt, now)}</div>
                        </td>
                        <td>{o.contactName}</td>
                        <td>
                          <span className={`aw-pill aw-pill--${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                          {o.paymentStatus === 'to_verify' ? <div className="muted">Payment to check</div> : null}
                        </td>
                        <td className="num">{taka(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="aw-empty">No orders yet.</p>
              )}
            </section>
          ) : null}

          <div className="aw-stack">
            {sales ? (
              <section aria-labelledby="best-title" className="aw-card">
                <div className="aw-dash__title">
                  <h2 id="best-title">Best sellers, last 30 days</h2>
                </div>
                {sales.bestSellers.length ? (
                  <ol className="aw-rank">
                    {sales.bestSellers.slice(0, 5).map((b, i) => (
                      <li key={b.id}>
                        <span className="aw-rank__n">{i + 1}</span>
                        <span className="aw-rank__title">
                          <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                          {b.author ? <div>{b.author}</div> : null}
                        </span>
                        <span className="aw-rank__value">{b.copies} sold</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="aw-empty">Nothing sold in the last 30 days.</p>
                )}
              </section>
            ) : null}

            {stock ? (
              <section aria-labelledby="reorder-title" className="aw-card">
                <div className="aw-dash__title">
                  <h2 id="reorder-title">Running low, reorder</h2>
                  {seesMoney ? <Link href="/admin/reports">Stock report →</Link> : null}
                </div>
                {stock.reorder.length ? (
                  <ol className="aw-rank">
                    {stock.reorder.slice(0, 5).map((b) => (
                      <li key={b.id}>
                        <span className="aw-rank__title">
                          <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                          <div>{b.soldLast60} sold in 60 days</div>
                        </span>
                        <span className="aw-rank__value">{b.copies} left</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="aw-empty">Nothing is selling faster than it is stocked.</p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </Gutter>
  )
}
