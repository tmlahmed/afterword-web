import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { PageHeading } from '../../../components/site/PageHeading'
import { getSettings } from '../../../lib/catalogue'
import { STAGE_LABEL } from '../../../lib/orders/labels'
import { booksToReview } from '../../../lib/reviews'
import { formatTaka } from '../../../lib/pricing'
import { getCustomer } from '../../../lib/session'
import type { Edition } from '../../../payload-types'
import { signOut } from '../actions'

export const metadata: Metadata = { title: 'Your account', robots: { index: false } }

const REQUEST: Record<string, string> = {
  new: 'We are looking for it',
  quoted: 'Ready to order',
  ordered: 'Ordered',
  declined: 'We could not find it',
  closed: 'Closed',
}

const POINTS_REASON: Record<string, string> = {
  earned: 'Earned',
  spent: 'Spent',
  refunded: 'Given back',
  adjustment: 'From AFTERWORD',
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })

export default async function AccountPage() {
  const customer = await getCustomer()
  if (!customer) redirect('/account/sign-in')
  const payload = await getPayload({ config })
  const [orders, requests, toReview, points] = await Promise.all([
    payload.find({ collection: 'orders', where: { customer: { equals: customer.id } }, sort: '-createdAt', depth: 0, limit: 50, overrideAccess: true }),
    payload.find({ collection: 'requests', where: { or: [{ customer: { equals: customer.id } }, { contactPhone: { equals: customer.phone } }] }, sort: '-createdAt', depth: 1, limit: 20, overrideAccess: true }),
    booksToReview(payload, customer.id),
    payload.find({ collection: 'reward-entries', where: { customer: { equals: customer.id } }, sort: '-createdAt', depth: 0, limit: 10, overrideAccess: true }),
  ])
  const settings = await getSettings()
  const rewardsOn = settings.rewardsEnabled !== false

  return (
    <>
      <PageHeading eyebrow="Your account" title={customer.name ? `Hello, ${customer.name.split(' ')[0]}` : 'Your account'} intro={`Signed in as ${customer.phone}.`}>
        <form action={signOut} className="mt-4">
          <button type="submit" className="link text-[0.875rem]">
            Sign out
          </button>
        </form>
      </PageHeading>

      <div className="mx-auto max-w-6xl space-y-14 px-4">
        <section>
          <h2 className="display border-t border-ink pt-3 text-[1.625rem]">Orders</h2>
          {orders.docs.length ? (
            <ul>
              {orders.docs.map((o) => (
                <li key={o.id} className="border-b border-rule">
                  <Link href={`/order/${o.token}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 hover:bg-card">
                    <span>
                      <span className="font-semibold">{o.number}</span>
                      <span className="ml-3 text-[0.875rem] text-ink-soft">{day(o.createdAt)}</span>
                      <span className="block text-[0.875rem] text-ink-soft">
                        {(o.lines ?? []).map((l) => l.title).join(', ')}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatTaka(o.total ?? 0)}</span>
                      <span className="block text-[0.875rem] text-green">{STAGE_LABEL[o.status]}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-ink-soft">
              No orders yet.{' '}
              <Link href="/collections/new-and-notable" className="link">
                Find something to read
              </Link>
              .
            </p>
          )}
        </section>

        {rewardsOn ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2 border-t border-ink pt-3">
              <h2 className="display text-[1.625rem]">Reward points</h2>
              <p className="font-serif text-[1.375rem]">
                {customer.rewardPoints ?? 0} <span className="text-[0.9375rem] text-ink-soft">points · worth {formatTaka(customer.rewardPoints ?? 0)}</span>
              </p>
            </div>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">
              You earn {settings.rewardsEarnPerHundred ?? 1} {(settings.rewardsEarnPerHundred ?? 1) === 1 ? 'point' : 'points'} for every ৳100 of books, once an order is
              delivered. Spend them at checkout once you have {settings.rewardsRedeemMinimum ?? 100}.
            </p>
            {points.docs.length ? (
              <ul className="mt-3">
                {points.docs.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 border-b border-rule py-2.5 text-[0.9375rem]">
                    <span>
                      {POINTS_REASON[e.reason] ?? e.reason}
                      {e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}
                      <span className="block text-[0.8125rem] text-ink-soft">{day(e.createdAt)}</span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${e.points > 0 ? 'text-green' : ''}`}>
                      {e.points > 0 ? '+' : '−'}
                      {Math.abs(e.points)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {toReview.length ? (
          <section>
            <h2 className="display border-t border-ink pt-3 text-[1.625rem]">Review your books</h2>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">Tell other readers what you thought. A few sentences is plenty.</p>
            <ul className="mt-2">
              {toReview.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-3">
                  <span>
                    <span className="font-serif text-[1.0625rem]">{b.title}</span>
                    <span className="block text-[0.875rem] text-ink-soft">{b.authorLine}</span>
                  </span>
                  <Link href={`/book/${b.slug}#review`} className="text-[0.875rem] font-semibold">
                    Write a review →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <div className="flex items-end justify-between border-t border-ink pt-3">
            <h2 className="display text-[1.625rem]">Book requests</h2>
            <Link href="/on-request" className="text-[0.8125rem] font-semibold">
              Request a book →
            </Link>
          </div>
          {requests.docs.length ? (
            <ul>
              {requests.docs.map((r) => {
                const book = typeof r.edition === 'object' ? (r.edition as Edition | null) : null
                return (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-4">
                    <span>
                      <span className="font-serif text-[1.0625rem]">{r.wanted}</span>
                      <span className="block text-[0.875rem] text-ink-soft">
                        Asked on {day(r.createdAt)}
                        {r.reply ? ` · ${r.reply}` : ''}
                      </span>
                    </span>
                    <span className="text-right text-[0.875rem]">
                      {r.status === 'quoted' && book ? (
                        <Link href={`/book/${book.slug}`} className="btn btn-primary !min-h-10">
                          {book.price ? `Order for ${formatTaka(book.price)}` : 'See the book'}
                        </Link>
                      ) : (
                        <span className="text-green">{REQUEST[r.status]}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-6 text-ink-soft">Looking for a book we do not list? Ask us and we will try to bring it in.</p>
          )}
        </section>
      </div>
    </>
  )
}
