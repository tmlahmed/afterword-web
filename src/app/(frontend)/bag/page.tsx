import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { Cover } from '../../../components/site/Books'
import { ArrowIcon } from '../../../components/site/Brand'
import { PageHeading } from '../../../components/site/PageHeading'
import { getBag } from '../../../lib/bag'
import { formatTaka } from '../../../lib/pricing'
import { setBagOptions, setQuantity } from '../actions'

export const metadata: Metadata = { title: 'Your bag', robots: { index: false } }

const KIND: Record<string, string> = { in_stock: 'In stock', pre_order: 'Pre-order', on_request: 'On Request' }

export default async function BagPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const [{ added }, bag] = await Promise.all([searchParams, getBag()])
  // Delivery depends on the address; show the Dhaka figure here and the exact one at checkout.
  const t = bag.totals('inside_dhaka')
  const blocked = bag.lines.some((l) => l.problem)

  if (bag.lines.length === 0)
    return (
      <>
        <PageHeading eyebrow="Your bag" title="Nothing here yet" intro="Books you add will wait here until you are ready to order." />
        <div className="mx-auto max-w-6xl px-4">
          <Link href="/collections/new-and-notable" className="btn btn-primary">
            Find something to read <ArrowIcon />
          </Link>
        </div>
      </>
    )

  return (
    <>
      <PageHeading eyebrow="Your bag" title={`${bag.count} ${bag.count === 1 ? 'book' : 'books'}`} />
      <div className="mx-auto max-w-6xl px-4 md:grid md:grid-cols-[1fr_22rem] md:items-start md:gap-12">
        <div>
          {added ? <p className="mb-4 border-l-2 border-green bg-card px-3 py-2.5 text-[0.9375rem]">Added to your bag.</p> : null}
          <ul className="border-t border-ink">
            {bag.lines.map((line) => (
              <li key={line.edition.id} className="flex gap-4 border-b border-rule py-5">
                <Link href={`/book/${line.edition.slug}`} className="flex w-[4.5rem] shrink-0 items-start justify-center">
                  <Cover title={line.edition.title} author={line.edition.authorLine} src={line.edition.coverUrl} sizes="5rem" className="max-h-[6.5rem]" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/book/${line.edition.slug}`} className="font-serif text-[1.125rem] leading-snug hover:underline">
                    {line.edition.title}
                  </Link>
                  <p className="text-[0.8125rem] text-ink-soft">{line.edition.authorLine}</p>
                  <p className="mt-1.5 text-[0.8125rem]">
                    <strong className="font-semibold">{KIND[line.kind]}.</strong> <span className="text-ink-soft">{line.note}</span>
                  </p>
                  {line.problem ? <p className="mt-1 text-[0.8125rem] font-semibold text-[#9b2c1f]">{line.problem}</p> : null}
                  <div className="mt-3 flex items-center gap-4">
                    <form action={setQuantity} className="flex items-center gap-2">
                      <input type="hidden" name="edition" value={line.edition.id} />
                      <label className="sr-only" htmlFor={`q-${line.edition.id}`}>
                        Quantity
                      </label>
                      <select id={`q-${line.edition.id}`} name="quantity" defaultValue={line.quantity} className="h-10 border border-ink/60 bg-card px-2">
                        {Array.from({ length: Math.max(10, line.quantity) }, (_, i) => i + 1).map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                      <button type="submit" className="text-[0.8125rem] underline decoration-rule underline-offset-4">
                        Update
                      </button>
                    </form>
                    <form action={setQuantity}>
                      <input type="hidden" name="edition" value={line.edition.id} />
                      <input type="hidden" name="quantity" value="0" />
                      <button type="submit" className="text-[0.8125rem] text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
                <p className="shrink-0 text-right font-semibold tabular-nums">{formatTaka(line.edition.price! * line.quantity)}</p>
              </li>
            ))}
          </ul>

          <form action={setBagOptions} className="mt-8 space-y-5 border border-rule p-5">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="giftWrap" defaultChecked={bag.giftWrap} className="mt-1 h-4 w-4 accent-[var(--color-green)]" />
              <span>
                <span className="font-semibold">Gift wrap this order</span> <span className="text-ink-soft">(+{formatTaka(bag.rules.giftWrapFee)})</span>
                <span className="block text-[0.8125rem] text-ink-soft">Wrapped in paper, with prices left off the slip.</span>
              </span>
            </label>
            <div>
              <label htmlFor="giftNote" className="mb-1.5 block text-[0.8125rem] font-semibold">
                Gift note <span className="font-normal text-ink-soft">(optional, printed on a card)</span>
              </label>
              <input id="giftNote" name="giftNote" maxLength={240} defaultValue={bag.giftNote} className="h-11 w-full border border-ink/60 bg-card px-3" />
            </div>
            <div>
              <label htmlFor="promoCode" className="mb-1.5 block text-[0.8125rem] font-semibold">
                Promotion code
              </label>
              <input id="promoCode" name="promoCode" defaultValue={bag.promoCode ?? ''} className="h-11 w-full max-w-xs border border-ink/60 bg-card px-3 uppercase" />
              {bag.promoRejected ? <p className="mt-1 text-[0.8125rem] text-[#9b2c1f]">That code is not valid.</p> : null}
              {bag.promotion && t.discount === 0 && bag.promotion.type !== 'free_delivery' ? (
                <p className="mt-1 text-[0.8125rem] text-ink-soft">This code needs a spend of {formatTaka(bag.promotion.minSubtotal ?? 0)}.</p>
              ) : null}
            </div>
            <button type="submit" className="btn btn-quiet">
              Update bag
            </button>
          </form>
        </div>

        <aside className="mt-10 border border-ink p-5 md:sticky md:top-36 md:mt-0">
          <h2 className="eyebrow">Summary</h2>
          <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
            <div className="flex justify-between">
              <dt>Books</dt>
              <dd className="tabular-nums">{formatTaka(t.subtotal)}</dd>
            </div>
            {t.discount ? (
              <div className="flex justify-between text-green">
                <dt>Discount ({bag.promoCode})</dt>
                <dd className="tabular-nums">−{formatTaka(t.discount)}</dd>
              </div>
            ) : null}
            {t.giftWrap ? (
              <div className="flex justify-between">
                <dt>Gift wrap</dt>
                <dd className="tabular-nums">{formatTaka(t.giftWrap)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd className="text-right tabular-nums">
                {t.delivery === 0 ? 'Free' : `${formatTaka(bag.rules.insideDhakaFee)} in Dhaka · ${formatTaka(bag.rules.outsideDhakaFee)} elsewhere`}
              </dd>
            </div>
          </dl>
          {t.freeDeliveryShortfall > 0 ? (
            <p className="mt-3 bg-paper-deep px-3 py-2 text-[0.8125rem]">
              Add {formatTaka(t.freeDeliveryShortfall)} more for free delivery.
            </p>
          ) : null}
          {t.advanceDue > 0 ? (
            <p className="mt-3 text-[0.8125rem] text-ink-soft">
              This order needs an advance of about {formatTaka(t.advanceDue)}; the rest is paid on delivery.
            </p>
          ) : null}
          {blocked ? (
            <p className="mt-4 text-[0.875rem] font-semibold text-[#9b2c1f]">Please fix the quantities marked above before checking out.</p>
          ) : (
            <Link href="/checkout" className="btn btn-primary mt-4 w-full">
              Checkout <ArrowIcon />
            </Link>
          )}
          <p className="mt-3 text-center text-[0.75rem] text-ink-faint">Cash on delivery available.</p>
        </aside>
      </div>
    </>
  )
}
