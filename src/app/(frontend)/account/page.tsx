import config from '@payload-config'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import {
  AccountNav,
  type AccountView,
  AlertIcon,
  BoxIcon,
  Empty,
  MoreLink,
  NAV,
  OrderCard,
  PenIcon,
  PersonIcon,
  type OrderCardData,
  Panel,
  SearchBookIcon,
  ShelfIcon,
  StarIcon,
  viewHref,
} from '../../../components/site/Account'
import { DetailsForm } from '../../../components/site/Forms'
import { getSettings } from '../../../lib/catalogue'
import { parcelsOf } from '../../../lib/orders/parcels'
import { formatTaka } from '../../../lib/pricing'
import { booksToReview } from '../../../lib/reviews'
import { getCustomer } from '../../../lib/session'
import type { Edition, Order } from '../../../payload-types'
import { signOut } from '../actions'

export const metadata: Metadata = { title: 'Your account', robots: { index: false } }

const REQUEST: Record<string, { text: string; tone: 'wait' | 'go' | 'done' }> = {
  new: { text: 'Looking for it', tone: 'wait' },
  quoted: { text: 'Ready to order', tone: 'go' },
  ordered: { text: 'Ordered', tone: 'done' },
  declined: { text: 'Could not find it', tone: 'done' },
  closed: { text: 'Closed', tone: 'done' },
}

const POINTS_REASON: Record<string, string> = {
  earned: 'Earned',
  spent: 'Spent at checkout',
  refunded: 'Given back',
  adjustment: 'From AFTERWORD',
}

const OPEN = ['placed', 'awaiting_stock', 'packing', 'shipped']
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })
const idOf = (v: unknown) => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))

type Props = { searchParams: Promise<{ view?: string }> }

export default async function AccountPage({ searchParams }: Props) {
  const customer = await getCustomer()
  if (!customer) redirect('/account/sign-in')
  const { view: asked } = await searchParams
  const payload = await getPayload({ config })
  const [orders, requests, toReview, points, settings] = await Promise.all([
    payload.find({ collection: 'orders', where: { customer: { equals: customer.id } }, sort: '-createdAt', depth: 0, limit: 50, overrideAccess: true }),
    payload.find({ collection: 'requests', where: { or: [{ customer: { equals: customer.id } }, { contactPhone: { equals: customer.phone } }] }, sort: '-createdAt', depth: 1, limit: 20, overrideAccess: true }),
    booksToReview(payload, customer.id),
    payload.find({ collection: 'reward-entries', where: { customer: { equals: customer.id } }, sort: '-createdAt', depth: 0, limit: 30, overrideAccess: true }),
    getSettings(),
  ])
  const rewardsOn = settings.rewardsEnabled !== false
  const views = NAV.map((n) => n.view).filter((v) => v !== 'rewards' || rewardsOn)
  const view: AccountView = views.includes(asked as AccountView) ? (asked as AccountView) : 'overview'

  // Covers for the order cards, in one query.
  const editionIds = [...new Set(orders.docs.flatMap((o) => (o.lines ?? []).map((l) => idOf(l.edition))))]
  const editions = editionIds.length
    ? (await payload.find({ collection: 'editions', where: { id: { in: editionIds } }, select: { coverUrl: true, slug: true }, depth: 0, pagination: false, overrideAccess: true })).docs
    : []
  const bookById = new Map(editions.map((e) => [e.id, e as Pick<Edition, 'id' | 'coverUrl' | 'slug'>]))
  const reviewable = new Map(toReview.map((b) => [b.id, b]))

  const card = (o: Order): OrderCardData => {
    const lines = o.lines ?? []
    const shipped = parcelsOf(o).find((p) => p.status === 'shipped')
    const unreviewed = o.status === 'delivered' ? lines.map((l) => reviewable.get(idOf(l.edition))).find(Boolean) : undefined
    let note: string | null = null
    if (o.status === 'placed' && o.paymentStatus === 'to_verify') note = `We are checking your payment of ${formatTaka(o.payNow ?? 0)}.`
    else if (o.status === 'placed' && (o.payNow ?? 0) > (o.paid ?? 0)) note = `Waiting for the advance of ${formatTaka((o.payNow ?? 0) - (o.paid ?? 0))}.`
    else if (o.status === 'placed') note = 'We will confirm it shortly.'
    else if (o.status === 'awaiting_stock') note = 'Your books are on their way to Dhaka. We will text you when they arrive.'
    else if (shipped?.courier) note = `${shipped.courier}${shipped.trackingId ? ` · tracking ${shipped.trackingId}` : ''}`
    return {
      id: o.id,
      number: o.number ?? '',
      token: o.token ?? '',
      status: o.status,
      createdAt: o.createdAt,
      total: o.total ?? 0,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      backorder: lines.some((l) => l.kind && l.kind !== 'in_stock'),
      books: lines.map((l) => ({ title: l.title ?? '', coverUrl: bookById.get(idOf(l.edition))?.coverUrl })),
      note,
      reviewHref: unreviewed ? `/book/${unreviewed.slug}#review` : null,
    }
  }

  const open = orders.docs.filter((o) => OPEN.includes(o.status))
  const past = orders.docs.filter((o) => !OPEN.includes(o.status))
  const quoted = requests.docs.filter((r) => r.status === 'quoted')
  const openRequests = requests.docs.filter((r) => r.status === 'new' || r.status === 'quoted')
  const balance = customer.rewardPoints ?? 0
  const minimum = settings.rewardsRedeemMinimum ?? 100
  const perHundred = settings.rewardsEarnPerHundred ?? 1

  // Things that need the customer, most urgent first.
  const attention: { key: string; text: React.ReactNode; href: string; cta: string; urgent?: boolean; Icon: React.FC<{ className?: string }> }[] = [
    ...open
      .filter((o) => o.status === 'placed' && o.paymentStatus !== 'to_verify' && (o.payNow ?? 0) > (o.paid ?? 0))
      .map((o) => ({ key: `pay-${o.id}`, text: <>Order {o.number} is waiting for an advance of <strong>{formatTaka((o.payNow ?? 0) - (o.paid ?? 0))}</strong>.</>, href: `/order/${o.token}`, cta: 'See how to pay', urgent: true, Icon: AlertIcon })),
    ...quoted.map((r) => {
      const book = typeof r.edition === 'object' ? (r.edition as Edition | null) : null
      return { key: `req-${r.id}`, text: <>We found <strong>{r.wanted}</strong>{book?.price ? ` for ${formatTaka(book.price)}` : ''}.</>, href: book ? `/book/${book.slug}` : viewHref('requests'), cta: 'Order it', Icon: SearchBookIcon }
    }),
    ...(!customer.name || !customer.address?.street
      ? [{ key: 'details', text: <>Add your name and delivery address to check out faster.</>, href: viewHref('details'), cta: 'Add details', Icon: PersonIcon }]
      : []),
    ...(toReview.length
      ? [{ key: 'review', text: <>{toReview.length === 1 ? <>What did you think of <strong>{toReview[0].title}</strong>?</> : <>You have <strong>{toReview.length} books</strong> to review.</>}</>, href: toReview.length === 1 ? `/book/${toReview[0].slug}#review` : viewHref('orders'), cta: 'Write a review', Icon: PenIcon }]
      : []),
  ]

  const first = customer.name?.trim().split(/\s+/)[0]
  const initials = (customer.name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  const signOutButton = (className: string) => (
    <form action={signOut}>
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-4 md:pt-12">
      {/* Who is signed in */}
      <header className="flex items-center gap-4 sm:gap-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[1.25rem] text-paper sm:size-16 sm:text-[1.5rem]">
          {initials || <PersonGlyph />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-[1.875rem] sm:text-[2.5rem]">{first ? `Hello, ${first}` : 'Your account'}</h1>
          <p className="text-[0.875rem] text-ink-soft">
            <span className="tabular-nums">{customer.phone.replace(/^\+88/, '')}</span> · Reading with us since{' '}
            {new Date(customer.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })}
          </p>
        </div>
        <div className="lg:hidden">{signOutButton('text-[0.875rem] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline')}</div>
      </header>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:mt-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-32 lg:self-start">
          <AccountNav
            active={view}
            counts={{ orders: open.length, requests: openRequests.length }}
            hide={rewardsOn ? [] : ['rewards']}
            signOut={signOutButton('flex h-11 w-full items-center gap-3 rounded-ui px-3 text-left text-[0.9375rem] text-ink-soft hover:bg-paper-deep hover:text-ink')}
          />
        </aside>

        <main className="min-w-0 space-y-6">
          {view === 'overview' ? (
            <>
              {attention.length ? (
                <section aria-label="Needs your attention" className="space-y-2">
                  {attention.map((a) => (
                    <div
                      key={a.key}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ui border border-l-[3px] px-4 py-3 ${
                        a.urgent ? 'border-accent/30 border-l-accent bg-accent/[0.04]' : 'border-rule border-l-ink bg-paper'
                      }`}
                    >
                      <a.Icon className={`shrink-0 ${a.urgent ? 'text-accent' : 'text-ink-soft'}`} />
                      <p className="min-w-0 flex-1 text-[0.9375rem]">{a.text}</p>
                      <Link href={a.href} className="text-[0.875rem] font-semibold whitespace-nowrap underline underline-offset-4">
                        {a.cta}
                      </Link>
                    </div>
                  ))}
                </section>
              ) : null}

              <div className={`grid gap-2 sm:gap-3 ${rewardsOn ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <Stat href={viewHref('orders')} Icon={BoxIcon} label="Orders in progress" value={String(open.length)} sub={`${orders.totalDocs} ${orders.totalDocs === 1 ? 'order' : 'orders'} in all`} />
                {rewardsOn ? <Stat href={viewHref('rewards')} Icon={StarIcon} label="Reward points" value={String(balance)} sub={`Worth ${formatTaka(balance)}`} /> : null}
                <Stat href={viewHref('requests')} Icon={SearchBookIcon} label="Book requests" value={String(openRequests.length)} sub={quoted.length ? `${quoted.length} ready to order` : 'Open requests'} />
              </div>

              <Panel title="Recent orders" action={orders.docs.length > 3 ? <MoreLink href={viewHref('orders')}>All orders</MoreLink> : null}>
                {orders.docs.length ? (
                  <div className="space-y-3">
                    {orders.docs.slice(0, 3).map((o) => (
                      <OrderCard key={o.id} order={card(o)} />
                    ))}
                  </div>
                ) : (
                  <NoOrders />
                )}
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2">
                <Shortcut href="/shelf" Icon={ShelfIcon} title="The Shelf" body="Books you have saved for later." />
                <Shortcut href="/on-request" Icon={SearchBookIcon} title="Request a book" body="Can’t find it here? We will try to bring it in." />
              </div>
            </>
          ) : null}

          {view === 'orders' ? (
            orders.docs.length ? (
              <>
                {open.length ? (
                  <Panel title="In progress">
                    <div className="space-y-3">
                      {open.map((o) => (
                        <OrderCard key={o.id} order={card(o)} />
                      ))}
                    </div>
                  </Panel>
                ) : null}
                {past.length ? (
                  <Panel title="Past orders">
                    <div className="space-y-3">
                      {past.map((o) => (
                        <OrderCard key={o.id} order={card(o)} />
                      ))}
                    </div>
                  </Panel>
                ) : null}
              </>
            ) : (
              <Panel>
                <NoOrders />
              </Panel>
            )
          ) : null}

          {view === 'rewards' && rewardsOn ? (
            <>
              <section className="overflow-hidden rounded-ui bg-ink p-6 text-paper sm:p-8">
                <p className="text-[0.75rem] font-semibold tracking-[0.16em] text-paper/70 uppercase">Your points</p>
                <p className="mt-2 flex items-baseline gap-3">
                  <span className="font-display text-[3rem] leading-none tabular-nums sm:text-[3.5rem]">{balance}</span>
                  <span className="text-[1rem] text-paper/75">worth {formatTaka(balance)}</span>
                </p>
                <div className="mt-6 max-w-md">
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper/20">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (balance / Math.max(1, minimum)) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-[0.875rem] text-paper/80">
                    {balance >= minimum ? 'Ready to spend at checkout.' : `${minimum - balance} more ${minimum - balance === 1 ? 'point' : 'points'} and you can spend them at checkout.`}
                  </p>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Earn', `${perHundred} ${perHundred === 1 ? 'point' : 'points'} for every ৳100 of books, once your order is delivered.`],
                  ['Collect', `Points add up from order to order. You can spend them once you have ${minimum}.`],
                  ['Spend', `At checkout, each point takes ৳1 off your books, up to ${settings.rewardsRedeemMaxPercent ?? 20}% of them.`],
                ].map(([t, b], i) => (
                  <div key={t} className="rounded-ui border border-rule bg-paper p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="flex size-6 items-center justify-center rounded-full bg-paper-deep text-[0.75rem] font-semibold">{i + 1}</span>
                      {t}
                    </p>
                    <p className="mt-1.5 text-[0.875rem] text-ink-soft">{b}</p>
                  </div>
                ))}
              </div>

              <Panel title="History">
                {points.docs.length ? (
                  <ul className="divide-y divide-rule">
                    {points.docs.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                        <span className="min-w-0">
                          <span className="block text-[0.9375rem]">
                            {POINTS_REASON[e.reason] ?? e.reason}
                            {e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}
                          </span>
                          <span className="block text-[0.8125rem] text-ink-faint">{day(e.createdAt)}</span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.875rem] font-semibold tabular-nums ${e.points > 0 ? 'bg-paper-deep text-ink' : 'text-ink-soft'}`}
                        >
                          {e.points > 0 ? '+' : '−'}
                          {Math.abs(e.points)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[0.9375rem] text-ink-soft">No points yet. You earn them when an order is delivered.</p>
                )}
              </Panel>
            </>
          ) : null}

          {view === 'requests' ? (
            <Panel
              title="Book requests"
              action={
                <Link href="/on-request" className="btn btn-quiet !min-h-10 !px-4 text-[0.875rem]">
                  Request a book
                </Link>
              }
            >
              {requests.docs.length ? (
                <ul className="space-y-3">
                  {requests.docs.map((r) => {
                    const book = typeof r.edition === 'object' ? (r.edition as Edition | null) : null
                    const s = REQUEST[r.status] ?? REQUEST.new
                    return (
                      <li key={r.id} className={`rounded-ui border p-4 ${s.tone === 'go' ? 'border-ink' : 'border-rule'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3.5">
                            {book?.coverUrl ? (
                              <Image src={book.coverUrl} alt="" width={44} height={66} sizes="44px" className="h-[3.9rem] w-[2.6rem] shrink-0 rounded-[2px] object-cover shadow-book" />
                            ) : null}
                            <div className="min-w-0">
                              <p className="font-medium">{r.wanted}</p>
                              <p className="text-[0.8125rem] text-ink-soft">Asked on {day(r.createdAt)}</p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[0.75rem] font-semibold ${
                              s.tone === 'go' ? 'border-ink bg-ink text-paper' : s.tone === 'wait' ? 'border-rule bg-paper-deep text-ink' : 'border-rule text-ink-soft'
                            }`}
                          >
                            {s.text}
                          </span>
                        </div>
                        {r.reply ? <p className="mt-3 rounded-ui bg-paper-deep px-3 py-2.5 text-[0.875rem]">“{r.reply}” <span className="text-ink-soft">— AFTERWORD</span></p> : null}
                        {r.status === 'quoted' && book ? (
                          <Link href={`/book/${book.slug}`} className="btn btn-primary mt-3 !min-h-10 !px-5 text-[0.875rem]">
                            {book.price ? `Order for ${formatTaka(book.price)}` : 'See the book'}
                          </Link>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <Empty
                  icon={<SearchBookIcon />}
                  title="No requests yet"
                  body="Looking for a book we don’t list? Tell us the title and we’ll try to bring it in from abroad."
                  action={
                    <Link href="/on-request" className="btn btn-primary">
                      Request a book
                    </Link>
                  }
                />
              )}
            </Panel>
          ) : null}

          {view === 'details' ? (
            <Panel title="Your details">
              <div className="max-w-xl">
                <DetailsForm phone={customer.phone} name={customer.name} email={customer.email} street={[customer.address?.street, customer.address?.area].filter(Boolean).join(', ')} district={customer.address?.district} />
              </div>
            </Panel>
          ) : null}
        </main>
      </div>
    </div>
  )
}

const PersonGlyph = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.8 4.1-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
  </svg>
)

const Stat: React.FC<{ href: string; Icon: React.FC<{ className?: string }>; label: string; value: string; sub: string }> = ({ href, Icon, label, value, sub }) => (
  <Link href={href} className="group min-w-0 rounded-ui border border-rule bg-paper p-3 transition-colors hover:border-ink/40 sm:p-5">
    <span className="flex items-start justify-between gap-2 text-[0.75rem] leading-tight text-ink-soft sm:text-[0.8125rem]">
      {label}
      <Icon className="hidden size-4 shrink-0 text-ink-faint group-hover:text-ink sm:block" />
    </span>
    <span className="mt-2 block font-display text-[1.625rem] leading-none tabular-nums sm:text-[2rem]">{value}</span>
    <span className="mt-1.5 hidden text-[0.8125rem] text-ink-soft sm:block">{sub}</span>
  </Link>
)

const Shortcut: React.FC<{ href: string; Icon: React.FC<{ className?: string }>; title: string; body: string }> = ({ href, Icon, title, body }) => (
  <Link href={href} className="group flex items-center gap-4 rounded-ui border border-rule bg-paper p-4 transition-colors hover:border-ink/40">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep">
      <Icon />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="block text-[0.8125rem] text-ink-soft">{body}</span>
    </span>
    <span aria-hidden className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
      →
    </span>
  </Link>
)

const NoOrders = () => (
  <Empty
    icon={<BoxIcon />}
    title="No orders yet"
    body="When you order, you can follow every book here, from our shelf to your door."
    action={
      <Link href="/collections/new-and-notable" className="btn btn-primary">
        Find something to read
      </Link>
    }
  />
)

