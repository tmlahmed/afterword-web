import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { userHasRole } from '../../access/roles'
import { demandReport, moneyReport, PERIODS, periodFrom, profitReport, salesReport, shipmentsReport, stockReport } from '../../lib/reports'

const taka = (n: number | null | undefined) => `৳${Math.round(n ?? 0).toLocaleString('en-IN')}`
const num = (n: number) => n.toLocaleString('en-IN')
const count = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`

const card: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  padding: '0.9rem 1.1rem',
  background: 'var(--theme-elevation-50)',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px 6px 0', fontWeight: 600, borderBottom: '1px solid var(--theme-elevation-200)' }
const td: React.CSSProperties = { padding: '6px 10px 6px 0', borderBottom: '1px solid var(--theme-elevation-100)', verticalAlign: 'top' }
const right: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const rightTh: React.CSSProperties = { ...th, textAlign: 'right' }

const Figure: React.FC<{ value: string; label: string; hint?: string }> = ({ value, label, hint }) => (
  <div style={card}>
    <div style={{ fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.15 }}>{value}</div>
    <div style={{ fontWeight: 600 }}>{label}</div>
    {hint ? <div style={{ fontSize: 13, opacity: 0.7 }}>{hint}</div> : null}
  </div>
)

const Section: React.FC<{ title: string; csv?: string; intro?: string; children: React.ReactNode }> = ({ title, csv, intro, children }) => (
  <section style={{ marginTop: '2.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {csv ? (
        <a href={csv} style={{ fontSize: 13 }}>
          Download as a spreadsheet (CSV)
        </a>
      ) : null}
    </div>
    {intro ? <p style={{ margin: '0.25rem 0 0.75rem', opacity: 0.75, maxWidth: '48rem' }}>{intro}</p> : null}
    <div style={{ overflowX: 'auto' }}>{children}</div>
  </section>
)

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }

/** Bars drawn with plain boxes, one per day, scaled to the busiest day. */
const DayBars: React.FC<{ days: { day: string; revenue: number; orders: number }[] }> = ({ days }) => {
  const max = Math.max(1, ...days.map((d) => d.revenue))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, marginTop: '0.75rem' }}>
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.orders} orders, ${taka(d.revenue)}`}
            style={{ flex: 1, minWidth: 2, height: `${Math.max(d.revenue ? 3 : 1, (d.revenue / max) * 100)}%`, background: d.revenue ? 'var(--theme-success-500)' : 'var(--theme-elevation-150)', borderRadius: '2px 2px 0 0' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.65, marginTop: 4 }}>
        <span>{days[0]?.day}</span>
        <span>Busiest day {taka(max)}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  )
}

export const Reports = async ({ initPageResult, params, searchParams }: AdminViewServerProps) => {
  const { req, permissions, visibleEntities, locale } = initPageResult
  const user = req.user
  if (!user) redirect('/admin/login?redirect=%2Fadmin%2Freports')
  const allowed = userHasRole(user, 'manager')
  const key = typeof searchParams?.period === 'string' ? searchParams.period : '30d'
  const period = periodFrom(key)

  const body = allowed ? (
    await (async () => {
      const [sales, money, stock, demand, profit, shipments] = await Promise.all([
        salesReport(req.payload, period),
        moneyReport(req.payload),
        stockReport(req.payload),
        demandReport(req.payload, period),
        profitReport(req.payload, period),
        shipmentsReport(req.payload),
      ])
      const pt = profit.totals
      const csv = (name: string) => `/api/reports/${name}.csv?period=${period.key}`
      const t = sales.totals
      return (
        <>
          <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/admin/reports?period=${p.key}`}
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--theme-elevation-200)',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: p.key === period.key ? 'var(--theme-elevation-150)' : 'transparent',
                  fontWeight: p.key === period.key ? 600 : 400,
                }}
              >
                {p.label}
              </Link>
            ))}
          </nav>

          <Section title={`Sales · ${period.label}`} csv={csv('sales')} intro="Orders placed in the period, not counting cancelled or returned ones. Totals include delivery.">
            <div style={grid}>
              <Figure value={taka(t.revenue)} label="Taken in orders" hint={count(t.orders, 'order')} />
              <Figure value={num(t.books)} label="Books sold" hint={`Book sales ${taka(t.bookSales)} after discounts`} />
              <Figure value={taka(t.averageOrder)} label="Average order" />
              <Figure value={taka(t.delivery)} label="Delivery charged" hint={`Discounts given ${taka(t.discounts)}`} />
              <Figure value={`${t.cancelled} · ${t.returned}`} label="Cancelled · returned" hint={`${t.cashOnDelivery} of ${count(t.orders, 'order')} cash on delivery`} />
            </div>
            <DayBars days={sales.days} />
          </Section>

          <Section title="Money still to come in" csv="/api/reports/couriers.csv" intro="Cash the couriers have collected or will collect, and advances waiting for a person to check.">
            <div style={grid}>
              <Figure value={taka(money.courierTotal)} label="With couriers" hint={`${count(money.withCouriers.length, 'parcel')} out`} />
              <Figure value={taka(money.toVerifyTotal)} label="Advances to check" hint={count(money.toVerify.length, 'order')} />
              <Figure value={taka(money.advancesHeldTotal)} label="Advances held" hint={`${count(money.advancesHeld.length, 'order')} not yet sent`} />
            </div>
            {money.couriers.length ? (
              <table style={{ borderCollapse: 'collapse', marginTop: '1rem', minWidth: 360 }}>
                <thead>
                  <tr>
                    <th style={th}>Courier</th>
                    <th style={rightTh}>Parcels</th>
                    <th style={rightTh}>To collect</th>
                  </tr>
                </thead>
                <tbody>
                  {money.couriers.map((c) => (
                    <tr key={c.name}>
                      <td style={td}>{c.name}</td>
                      <td style={right}>{c.parcels}</td>
                      <td style={right}>{taka(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Section>

          <Section title="Best sellers" csv={csv('best-sellers')}>
            {sales.bestSellers.length ? (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Book</th>
                    <th style={rightTh}>Copies</th>
                    <th style={rightTh}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.bestSellers.slice(0, 20).map((b) => (
                    <tr key={b.id}>
                      <td style={td}>
                        <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                        <span style={{ opacity: 0.65 }}> · {b.author}</span>
                      </td>
                      <td style={right}>{b.copies}</td>
                      <td style={right}>{taka(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ opacity: 0.7 }}>No sales in this period.</p>
            )}
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            <Section title="By subject">
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {sales.subjects.slice(0, 12).map((s) => (
                    <tr key={s.name}>
                      <td style={td}>{s.name}</td>
                      <td style={right}>{count(s.copies, 'copy', 'copies')}</td>
                      <td style={right}>{taka(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="By district">
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {sales.districts.slice(0, 12).map((d) => (
                    <tr key={d.name}>
                      <td style={td}>{d.name}</td>
                      <td style={right}>{count(d.orders, 'order')}</td>
                      <td style={right}>{taka(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          <Section
            title={`Profit · ${period.label}`}
            intro="What customers paid for the books (after discounts, without delivery) less what those exact copies cost you: each copy carries the landed cost of the delivery it came from."
          >
            <div style={grid}>
              <Figure value={taka(pt.revenue)} label="Book sales" hint={count(pt.copies, 'copy', 'copies')} />
              <Figure value={taka(pt.cost)} label="Cost of those copies" hint={pt.unknownCopies ? `${pt.unknownCopies} copies have no cost` : undefined} />
              <Figure value={taka(pt.profit)} label="Profit" hint={`${pt.margin}% of book sales`} />
            </div>
            {profit.byTitle.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={th}>Book</th>
                    <th style={rightTh}>Copies</th>
                    <th style={rightTh}>Sales</th>
                    <th style={rightTh}>Cost</th>
                    <th style={rightTh}>Profit</th>
                    <th style={rightTh}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profit.byTitle.slice(0, 25).map((b) => (
                    <tr key={b.id}>
                      <td style={td}>
                        <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                      </td>
                      <td style={right}>{num(b.copies)}</td>
                      <td style={right}>{taka(b.revenue)}</td>
                      <td style={right}>{b.unknown ? '—' : taka(b.cost)}</td>
                      <td style={right}>{b.unknown ? '—' : taka(b.profit)}</td>
                      <td style={right}>{b.unknown || !b.revenue ? '—' : `${Math.round((b.profit / b.revenue) * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Section>

          <Section
            title="Deliveries"
            intro="Each purchase order received: copies in, sold and left, what they cost with shipping and duty, and the profit on the copies sold so far."
          >
            {shipments.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={th}>Delivery</th>
                    <th style={th}>Received</th>
                    <th style={rightTh}>In</th>
                    <th style={rightTh}>Sold</th>
                    <th style={rightTh}>Left</th>
                    <th style={rightTh}>Cost</th>
                    <th style={rightTh}>Sales so far</th>
                    <th style={rightTh}>Profit so far</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.slice(0, 30).map((d) => (
                    <tr key={d.key}>
                      <td style={td}>
                        {d.id ? <Link href={`/admin/collections/purchase-orders/${d.id}`}>{d.reference}</Link> : d.reference}
                        {d.supplier ? <div style={{ fontSize: 12, opacity: 0.65 }}>{d.supplier}</div> : null}
                        {d.estimated ? <div style={{ fontSize: 12, opacity: 0.65 }}>Some costs estimated</div> : null}
                      </td>
                      <td style={td}>{d.receivedAt.slice(0, 10)}</td>
                      <td style={right}>{num(d.copiesIn)}</td>
                      <td style={right}>{num(d.sold)}</td>
                      <td style={right}>{num(d.left)}</td>
                      <td style={right}>{taka(d.cost)}</td>
                      <td style={right}>{taka(d.revenue)}</td>
                      <td style={right}>{taka(d.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ opacity: 0.7 }}>No deliveries yet.</p>
            )}
          </Section>

          <Section
            title="Stock"
            csv="/api/reports/stock.csv"
            intro="Cost is what the copies on the shelf cost you: each delivery’s landed cost. Copies from before costs were recorded use an estimate (printed price less your usual supplier discount, at your exchange rate)."
          >
            <div style={grid}>
              <Figure value={num(stock.copies)} label="Copies in Dhaka" hint={count(stock.titles, 'title')} />
              <Figure value={taka(stock.retailValue)} label="At selling price" />
              <Figure
                value={taka(stock.costValue)}
                label="What they cost you"
                hint={[stock.estimatedCopies ? `${num(stock.estimatedCopies)} copies estimated` : '', stock.costUnknown ? `${stock.costUnknown} titles with no cost` : ''].filter(Boolean).join(' · ') || undefined}
              />
              <Figure value={num(stock.unpublished.length)} label="In stock but not in the shop" hint="Drafts or archived books with copies" />
            </div>
          </Section>

          <Section title="Selling fast — consider reordering" intro="Four or more sold in the last 60 days, and copies left would last about a month or less.">
            {stock.reorder.length ? (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Book</th>
                    <th style={rightTh}>Sold in 60 days</th>
                    <th style={rightTh}>Copies left</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.reorder.slice(0, 30).map((b) => (
                    <tr key={b.id}>
                      <td style={td}>
                        <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                      </td>
                      <td style={right}>{b.soldLast60}</td>
                      <td style={right}>{b.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ opacity: 0.7 }}>Nothing is running low.</p>
            )}
          </Section>

          <Section title="Not selling" csv="/api/reports/slow.csv" intro="Books that have been in stock at least 90 days with no sale in the last 90. The most money tied up first — candidates for a feature, a collection or a price change.">
            {stock.slow.length ? (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Book</th>
                    <th style={rightTh}>Copies</th>
                    <th style={rightTh}>Value</th>
                    <th style={rightTh}>Last sold</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.slow.slice(0, 30).map((b) => (
                    <tr key={b.id}>
                      <td style={td}>
                        <Link href={`/admin/collections/editions/${b.id}`}>{b.title}</Link>
                      </td>
                      <td style={right}>{b.copies}</td>
                      <td style={right}>{taka(b.retailValue)}</td>
                      <td style={right}>{b.lastSold ?? 'Not in the last year'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ opacity: 0.7 }}>Nothing yet: every book in stock has either sold in the last 90 days or arrived less than 90 days ago.</p>
            )}
            {stock.slow.length > 30 ? <p style={{ fontSize: 13, opacity: 0.7 }}>And {stock.slow.length - 30} more in the download.</p> : null}
          </Section>

          <Section
            title={`What customers asked for · ${period.label}`}
            csv={csv('searches')}
            intro="Book requests, and searches on the site that found nothing. Both are a guide to what to bring in."
          >
            <div style={grid}>
              <Figure value={num(demand.requests)} label="Book requests" hint={`${demand.open} still to quote`} />
              <Figure value={num(demand.ordered)} label="Requests ordered" hint={`${demand.quoted} quoted, waiting · ${demand.declined} declined`} />
            </div>
            {demand.searches.length ? (
              <table style={{ borderCollapse: 'collapse', marginTop: '1rem', minWidth: 360 }}>
                <thead>
                  <tr>
                    <th style={th}>Searched for</th>
                    <th style={rightTh}>Times</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.searches.slice(0, 25).map((s) => (
                    <tr key={s.query}>
                      <td style={td}>{s.query}</td>
                      <td style={right}>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Section>
        </>
      )
    })()
  ) : (
    <p>Reports are for managers. Ask the owner for access.</p>
  )

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
        <h1 style={{ marginTop: '1.5rem' }}>Reports</h1>
        {body}
      </Gutter>
    </DefaultTemplate>
  )
}
