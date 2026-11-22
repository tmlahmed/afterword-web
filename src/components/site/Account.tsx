import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { formatTaka } from '../../lib/pricing'

/** Pieces of the account pages. Server components; nothing here runs in the browser. */

export type AccountView = 'overview' | 'orders' | 'reviews' | 'rewards' | 'requests' | 'details'

type IconProps = { className?: string }
const icon = (d: React.ReactNode) => {
  const Icon: React.FC<IconProps> = ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {d}
    </svg>
  )
  return Icon
}
export const HomeIcon = icon(<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />)
export const BoxIcon = icon(
  <>
    <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </>,
)
export const StarIcon = icon(<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />)
export const SearchBookIcon = icon(
  <>
    <path d="M5 4.5h9a2 2 0 0 1 2 2V10M5 4.5v15h6M5 4.5a1.5 1.5 0 0 0 0 3" />
    <circle cx="16.5" cy="15.5" r="3.5" />
    <path d="m19 18 2 2" />
  </>,
)
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.8 4.1-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
  </>,
)
export const PenIcon = icon(<path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3" />)
export const ShelfIcon = icon(<path d="M6 4h12v16l-6-4-6 4z" />)
export const ArrowRight = icon(<path d="M5 12h14m-6-6 6 6-6 6" />)
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </>,
)

export const NAV: { view: AccountView; label: string; Icon: React.FC<IconProps> }[] = [
  { view: 'overview', label: 'Overview', Icon: HomeIcon },
  { view: 'orders', label: 'Orders', Icon: BoxIcon },
  { view: 'reviews', label: 'Reviews', Icon: PenIcon },
  { view: 'rewards', label: 'Reward points', Icon: StarIcon },
  { view: 'requests', label: 'Book requests', Icon: SearchBookIcon },
  { view: 'details', label: 'Your details', Icon: PersonIcon },
]

export const viewHref = (view: AccountView) => (view === 'overview' ? '/account' : `/account?view=${view}`)

/** The account menu: a list down the side on wide screens, a row of tabs on phones. */
export const AccountNav: React.FC<{ active: AccountView; counts: Partial<Record<AccountView, number>>; hide?: AccountView[]; signOut: React.ReactNode }> = ({
  active,
  counts,
  hide = [],
  signOut,
}) => {
  const items = NAV.filter((n) => !hide.includes(n.view))
  return (
    <>
      {/* Phones and tablets */}
      <nav aria-label="Your account" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max gap-2 pb-1">
          {items.map(({ view, label }) => (
            <li key={view}>
              <Link
                href={viewHref(view)}
                aria-current={active === view ? 'page' : undefined}
                className={`flex h-10 items-center gap-2 rounded-full border px-4 text-[0.875rem] font-medium whitespace-nowrap ${
                  active === view ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper text-ink hover:border-ink/50'
                }`}
              >
                {label}
                {counts[view] ? (
                  <span className={`rounded-full px-1.5 text-[0.75rem] tabular-nums ${active === view ? 'bg-paper/20' : 'bg-paper-deep'}`}>{counts[view]}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Wide screens */}
      <nav aria-label="Your account" className="hidden lg:block">
        <ul className="space-y-0.5">
          {items.map(({ view, label, Icon }) => (
            <li key={view}>
              <Link
                href={viewHref(view)}
                aria-current={active === view ? 'page' : undefined}
                className={`flex h-11 items-center gap-3 rounded-ui px-3 text-[0.9375rem] ${
                  active === view ? 'bg-ink font-medium text-paper' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'
                }`}
              >
                <Icon className="shrink-0" />
                <span className="flex-1">{label}</span>
                {counts[view] ? (
                  <span className={`min-w-6 rounded-full px-1.5 text-center text-[0.75rem] font-semibold tabular-nums ${active === view ? 'bg-paper/20' : 'bg-paper-deep text-ink'}`}>
                    {counts[view]}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-rule pt-4">{signOut}</div>
      </nav>
    </>
  )
}

/** A white panel with an optional title row. */
export const Panel: React.FC<{ title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
  <section className={`rounded-ui border border-rule bg-paper p-5 sm:p-6 ${className}`}>
    {title ? (
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[1.25rem] font-medium">{title}</h2>
        {action}
      </div>
    ) : null}
    {children}
  </section>
)

export const MoreLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Link href={href} className="group inline-flex items-center gap-1 text-[0.875rem] font-medium">
    {children}
    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
  </Link>
)

// --- Orders -----------------------------------------------------------------------

export type OrderStage = 'placed' | 'awaiting_stock' | 'packing' | 'shipped' | 'delivered' | 'returned' | 'cancelled'

const PILL: Record<OrderStage, { text: string; className: string }> = {
  placed: { text: 'Received', className: 'border-accent/40 bg-accent/[0.06] text-accent' },
  awaiting_stock: { text: 'Coming from abroad', className: 'border-ink bg-ink text-paper' },
  packing: { text: 'Being packed', className: 'border-ink bg-ink text-paper' },
  shipped: { text: 'With the courier', className: 'border-ink bg-ink text-paper' },
  delivered: { text: 'Delivered', className: 'border-rule bg-paper-deep text-ink' },
  returned: { text: 'Returned', className: 'border-rule bg-paper text-ink-soft' },
  cancelled: { text: 'Cancelled', className: 'border-rule bg-paper text-ink-soft' },
}

export const StatusPill: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const p = PILL[status as OrderStage] ?? PILL.placed
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold whitespace-nowrap ${p.className}`}>
      {status === 'delivered' ? (
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 8.5 3 3 7-7" />
        </svg>
      ) : ['awaiting_stock', 'packing', 'shipped'].includes(status) ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : null}
      {label ?? p.text}
    </span>
  )
}

/** Where an open order is: a line of steps, filled up to the current one. */
const Progress: React.FC<{ status: string; backorder: boolean }> = ({ status, backorder }) => {
  const steps: { key: OrderStage; label: string }[] = [
    { key: 'placed', label: 'Received' },
    ...(backorder ? [{ key: 'awaiting_stock' as const, label: 'Arriving' }] : []),
    { key: 'packing', label: 'Packed' },
    { key: 'shipped', label: 'On its way' },
    { key: 'delivered', label: 'Delivered' },
  ]
  const at = Math.max(0, steps.findIndex((s) => s.key === status))
  return (
    <ol className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s.key} aria-current={i === at ? 'step' : undefined}>
          <span className={`block h-1 rounded-full ${i <= at ? 'bg-ink' : 'bg-rule'}`} />
          <span className={`mt-1.5 block truncate text-[0.6875rem] sm:text-[0.75rem] ${i === at ? 'font-semibold text-ink' : i < at ? 'text-ink-soft' : 'text-ink-faint'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

export type OrderCardData = {
  id: number
  number: string
  token: string
  status: string
  createdAt: string
  total: number
  count: number
  backorder: boolean
  books: { title: string; coverUrl?: string | null }[]
  /** Something the customer should know or do, shown under the books. */
  note?: string | null
  reviewHref?: string | null
  /** The book that link reviews, named on the button. */
  reviewTitle?: string | null
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })

export const OrderCard: React.FC<{ order: OrderCardData }> = ({ order: o }) => {
  const open = ['placed', 'awaiting_stock', 'packing', 'shipped'].includes(o.status)
  const covers = o.books.slice(0, 4)
  return (
    <article className="group relative rounded-ui border border-rule bg-paper p-4 transition-colors hover:border-ink/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="font-medium">
            <Link href={`/order/${o.token}`} className="after:absolute after:inset-0">
              Order {o.number}
            </Link>
          </h3>
          <p className="text-[0.8125rem] text-ink-soft">
            {day(o.createdAt)} · {o.count} {o.count === 1 ? 'book' : 'books'} · <span className="tabular-nums">{formatTaka(o.total)}</span>
          </p>
        </div>
        <StatusPill status={o.status} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex shrink-0 -space-x-3">
          {covers.map((b, i) =>
            b.coverUrl ? (
              <Image
                key={i}
                src={b.coverUrl}
                alt=""
                width={44}
                height={66}
                sizes="44px"
                className="h-[3.9rem] w-[2.6rem] rounded-[2px] border-2 border-paper bg-paper object-cover shadow-book"
                style={{ zIndex: covers.length - i }}
              />
            ) : (
              <span key={i} className="block h-[3.9rem] w-[2.6rem] rounded-[2px] border-2 border-paper bg-paper-deep" style={{ zIndex: covers.length - i }} />
            ),
          )}
        </div>
        <p className="line-clamp-2 min-w-0 text-[0.875rem] text-ink-soft">
          {o.books.map((b) => b.title).join(', ')}
        </p>
      </div>

      {open ? <Progress status={o.status} backorder={o.backorder} /> : null}

      {o.note || o.reviewHref ? (
        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3 text-[0.8125rem]">
          {o.note ? <span className="text-ink-soft">{o.note}</span> : <span />}
          {o.reviewHref ? (
            <Link href={o.reviewHref} className="inline-flex items-center gap-1.5 font-medium hover:underline">
              <PenIcon className="size-4" /> {o.reviewTitle ? `Review ${o.reviewTitle}` : 'Write a review'}
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

/** A friendly empty state with one clear next step. */
export const Empty: React.FC<{ icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }> = ({ icon: i, title, body, action }) => (
  <div className="flex flex-col items-center rounded-ui border border-dashed border-rule px-6 py-12 text-center">
    <span className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft [&_svg]:size-6">{i}</span>
    <p className="mt-4 font-display text-[1.125rem] font-medium">{title}</p>
    <p className="mt-1 max-w-sm text-[0.9375rem] text-ink-soft">{body}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
)
