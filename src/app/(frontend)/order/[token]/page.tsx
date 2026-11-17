import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { getSettings } from '../../../../lib/catalogue'
import { STAGE_LABEL } from '../../../../lib/orders/labels'
import { formatTaka } from '../../../../lib/pricing'
import { linesIn, parcelsOf } from '../../../../lib/orders/parcels'

const PARCEL_TEXT: Record<string, string> = {
  pending: 'Waiting for the books to arrive',
  packing: 'Being packed',
  shipped: 'On its way',
  delivered: 'Delivered',
  returned: 'Came back to us',
  cancelled: 'Cancelled',
}

export const metadata: Metadata = { title: 'Your order', robots: { index: false } }

const STEPS = ['placed', 'awaiting_stock', 'packing', 'shipped', 'delivered'] as const
const KIND: Record<string, string> = { in_stock: 'From stock', pre_order: 'Pre-order', on_request: 'On Request' }

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string; paid?: string }> }

/** The customer's tracking page. Anyone with the link can see it, so it shows no more of the address than the area. */
export default async function OrderPage({ params, searchParams }: Props) {
  const [{ token }, { placed, paid }] = await Promise.all([params, searchParams])
  if (!/^[a-f0-9]{36}$/.test(token)) notFound()
  const payload = await getPayload({ config })
  const found = await payload.find({ collection: 'orders', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })
  const order = found.docs[0]
  if (!order) notFound()
  const settings = await getSettings()

  const closed = ['cancelled', 'returned'].includes(order.status)
  const hasBackorder = (order.lines ?? []).some((l) => l.kind !== 'in_stock')
  const steps = STEPS.filter((s) => s !== 'awaiting_stock' || hasBackorder)
  const at = steps.indexOf(order.status as (typeof steps)[number])
  const advanceOwing = Math.max(0, (order.payNow ?? 0) - (order.paid ?? 0))
  const parcels = parcelsOf(order)

  let headline = STAGE_LABEL[order.status]
  let detail = ''
  if (order.status === 'placed') {
    headline = placed ? 'Thank you. Your order is in.' : 'We have your order'
    detail =
      advanceOwing > 0
        ? order.paymentStatus === 'to_verify'
          ? `We are checking your bKash payment of ${formatTaka(advanceOwing)} and will confirm by text message shortly.`
          : `Your order will be confirmed as soon as the advance of ${formatTaka(advanceOwing)} is received.`
        : 'We will confirm it by text message or a short call before it is packed.'
  } else if (order.status === 'awaiting_stock') detail = 'We have ordered your books from the publisher. We will text you the moment they reach Dhaka.'
  else if (order.status === 'packing') detail = 'Your books are being packed and will be with the courier shortly.'
  else if (order.status === 'shipped') detail = `On its way with ${order.courier}. Tracking number ${order.trackingId}.`
  else if (order.status === 'delivered')
    detail = `We hope you enjoy them.${order.pointsEarned ? ` You earned ${order.pointsEarned} reward points (worth ${formatTaka(order.pointsEarned)}) to spend next time.` : ''}`
  else if (order.status === 'cancelled') detail = (order.paid ?? 0) > 0 ? `Your payment of ${formatTaka(order.paid ?? 0)} will be refunded.` : 'Nothing has been charged.'

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-10 md:pt-14">
      <p className="eyebrow">Order {order.number}</p>
      <h1 className="display mt-2 text-[2.25rem] md:text-[3rem]">{headline}</h1>
      {detail ? <p className="mt-3 font-display text-[1.125rem] text-ink-soft">{detail}</p> : null}
      {paid === '0' ? (
        <p className="mt-4 border-l-2 border-[#9b2c1f] bg-[#9b2c1f]/8 px-3 py-2.5 text-[0.9375rem]">
          The payment did not go through. Nothing was charged.{' '}
          <Link href={`/pay/${order.payNowVia === 'bkash' ? 'bkash' : 'sslcommerz'}/start?t=${order.token}`} className="link">
            Try again
          </Link>
          .
        </p>
      ) : null}

      {!closed ? (
        <ol className="mt-9 grid gap-0 border-t border-ink sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] sm:border-t-0">
          {steps.map((step, i) => {
            const done = i < at || order.status === 'delivered'
            const current = i === at && order.status !== 'delivered'
            return (
              <li key={step} className={`flex items-center gap-3 border-b border-rule py-3 sm:block sm:border-b-0 sm:border-t-2 sm:pt-3 ${done || current ? 'sm:border-primary' : 'sm:border-rule'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold sm:mb-2 ${done ? 'bg-primary text-paper' : current ? 'border-2 border-primary text-primary' : 'border border-rule text-ink-faint'}`}>
                  {done ? '✓' : i + 1}
                </span>
                <span className={`text-[0.875rem] ${current ? 'font-semibold' : done ? '' : 'text-ink-faint'}`}>{STAGE_LABEL[step]}</span>
              </li>
            )
          })}
        </ol>
      ) : null}

      {/* Two parcels: what is in each, where it is, and what to pay when it comes. */}
      {parcels.length > 1 ? (
        <section className="mt-10">
          <h2 className="eyebrow">Your two parcels</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {parcels.map((p, i) => (
              <li key={i} className="border rounded-ui border-rule px-4 py-3.5">
                <p className="font-semibold">{i === 0 ? 'Books in stock' : 'Books we are ordering in'}</p>
                <p className="mt-0.5 text-[0.9375rem] text-ink-soft">
                  {p.status === 'pending' && linesIn(order.lines, i).every((l) => l.allocated)
                    ? 'Here and set aside for you; packed once your order is confirmed'
                    : (PARCEL_TEXT[p.status] ?? p.status)}
                  {p.status === 'shipped' && p.courier ? ` with ${p.courier}, tracking ${p.trackingId}` : ''}
                </p>
                <p className="mt-1 text-[0.875rem] text-ink-soft">{linesIn(order.lines, i).map((l) => l.title).join(', ')}</p>
                {['pending', 'packing', 'shipped'].includes(p.status) ? (
                  <p className="mt-2 text-[0.9375rem]">
                    {(p.collect ?? 0) > 0 ? (
                      <>
                        Pay <strong>{formatTaka(p.collect ?? 0)}</strong> on delivery
                      </>
                    ) : (
                      'Nothing to pay on delivery'
                    )}
                    {i === 1 ? <span className="text-ink-soft"> · no extra delivery charge</span> : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="eyebrow">Your books</h2>
        <ul className="mt-2 border-t border-ink">
          {(order.lines ?? []).map((l) => (
            <li key={l.id} className="flex justify-between gap-4 border-b border-rule py-3">
              <span>
                <span className="font-display text-[1.0625rem]">{l.title}</span>
                {l.quantity > 1 ? <span className="text-ink-soft"> × {l.quantity}</span> : null}
                <span className="block text-[0.8125rem] text-ink-soft">
                  {l.authorLine} · {KIND[l.kind ?? 'in_stock']}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatTaka((l.unitPrice ?? 0) * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-xs space-y-1 text-[0.9375rem]">
          {order.discount ? (
            <div className="flex justify-between text-primary">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{formatTaka(order.discount)}</dd>
            </div>
          ) : null}
          {order.rewardDiscount ? (
            <div className="flex justify-between text-primary">
              <dt>Paid with points</dt>
              <dd className="tabular-nums">−{formatTaka(order.rewardDiscount)}</dd>
            </div>
          ) : null}
          {order.giftWrapFee ? (
            <div className="flex justify-between">
              <dt>Gift wrap</dt>
              <dd className="tabular-nums">{formatTaka(order.giftWrapFee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd className="tabular-nums">{order.delivery ? formatTaka(order.delivery) : 'Free'}</dd>
          </div>
          <div className="flex justify-between border-t border-ink pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatTaka(order.total ?? 0)}</dd>
          </div>
          {(order.paid ?? 0) > 0 ? (
            <div className="flex justify-between text-ink-soft">
              <dt>Paid</dt>
              <dd className="tabular-nums">{formatTaka(order.paid ?? 0)}</dd>
            </div>
          ) : null}
          {!closed && order.status !== 'delivered' && (order.payOnDelivery ?? 0) > 0 ? (
            <div className="flex justify-between">
              <dt>To pay on delivery</dt>
              <dd className="tabular-nums">{formatTaka(order.payOnDelivery ?? 0)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-10 grid gap-6 border-t border-rule pt-6 text-[0.9375rem] sm:grid-cols-2">
        <div>
          <h2 className="eyebrow">Delivering to</h2>
          <p className="mt-1.5">
            {order.contactName}
            <br />
            {order.area}, {order.district}
          </p>
          <p className="mt-1 text-ink-soft">{order.zone === 'inside_dhaka' ? settings.insideDhakaDays : settings.outsideDhakaDays} after dispatch</p>
        </div>
        <div>
          <h2 className="eyebrow">Need help?</h2>
          <p className="mt-1.5 text-ink-soft">
            Reply to any of our text messages, or see{' '}
            <Link href="/help" className="link">
              Help
            </Link>
            . Quote order {order.number}.
          </p>
        </div>
      </section>
    </div>
  )
}
