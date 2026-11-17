'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useActionState, useOptimistic, useState, useTransition } from 'react'

import { applyPromo, type PromoState, removePromo, setGift, setQuantity } from '../../app/(frontend)/actions'
import { priceOrder, type Promotion, type ShopRules } from '../../lib/orders/pricing'
import { formatTaka } from '../../lib/pricing'
import { ArrowIcon } from './Brand'
import { BinIcon, QtyStepper } from './QtyStepper'

export type BagViewLine = {
  id: number
  title: string
  slug: string
  authorLine?: string | null
  coverUrl?: string | null
  unitPrice: number
  quantity: number
  /** Most copies that can be ordered: copies on hand for stocked books. */
  max: number
  kind: 'in_stock' | 'pre_order' | 'on_request'
  note: string
}

const KIND: Record<BagViewLine['kind'], string> = { in_stock: 'In stock', pre_order: 'Pre-order', on_request: 'On Request' }

type Change = { id: number; quantity: number; restore?: BagViewLine }

/**
 * The bag page. Every change (quantity, removing, gift wrap, promotion code) saves itself
 * at once and the totals follow immediately; the server's figures replace them a moment later.
 * Totals are worked out with the same rules the order uses, so nothing jumps at checkout.
 */
export const BagView: React.FC<{
  lines: BagViewLine[]
  rules: ShopRules
  promotion: Promotion | null
  giftWrap: boolean
  giftNote: string
}> = ({ lines: serverLines, rules, promotion, giftWrap: savedWrap, giftNote: savedNote }) => {
  const [, startTransition] = useTransition()
  const [lines, applyChange] = useOptimistic(serverLines, (current, change: Change) => {
    if (change.restore) return current.some((l) => l.id === change.id) ? current : [...current, change.restore]
    return change.quantity <= 0 ? current.filter((l) => l.id !== change.id) : current.map((l) => (l.id === change.id ? { ...l, quantity: change.quantity } : l))
  })
  const [removed, setRemoved] = useState<BagViewLine | null>(null)
  const [wrap, setWrap] = useState(savedWrap)
  const [note, setNote] = useState(savedNote)
  const [noteSaved, setNoteSaved] = useState(false)
  const [promoState, promoAction, promoPending] = useActionState<PromoState, FormData>(applyPromo, {})

  const save = (line: BagViewLine, quantity: number) => {
    if (quantity <= 0) setRemoved(line)
    else setRemoved(null)
    const form = new FormData()
    form.set('edition', String(line.id))
    form.set('quantity', String(Math.max(0, quantity)))
    startTransition(async () => {
      applyChange({ id: line.id, quantity })
      await setQuantity(form)
    })
  }

  const undo = () => {
    if (!removed) return
    const line = removed
    setRemoved(null)
    const form = new FormData()
    form.set('edition', String(line.id))
    form.set('quantity', String(line.quantity))
    startTransition(async () => {
      applyChange({ id: line.id, quantity: line.quantity, restore: line })
      await setQuantity(form)
    })
  }

  const saveGift = (nextWrap: boolean, nextNote: string) =>
    startTransition(async () => {
      await setGift(nextWrap, nextNote)
      setNoteSaved(true)
    })

  const t = priceOrder(
    lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, kind: l.kind })),
    'inside_dhaka',
    rules,
    { giftWrap: wrap, promotion },
  )
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const tooMany = lines.filter((l) => l.kind === 'in_stock' && l.quantity > l.max)
  const freeAbove = rules.freeDeliveryAbove
  const towardsFree = t.subtotal - t.discount
  const promoNeedsMore = promotion && promotion.type !== 'free_delivery' && t.discount === 0 && t.subtotal > 0
  const deliveryFree = t.delivery === 0 && lines.length > 0

  const total = t.subtotal - t.discount + t.giftWrap

  const freeBar =
    freeAbove > 0 && lines.length > 0 ? (
      <div className="mt-5">
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <TruckIcon /> Free delivery
        </p>
        <div className="mt-2.5 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-rule"
            role="progressbar"
            aria-label="Towards free delivery"
            aria-valuemin={0}
            aria-valuemax={freeAbove}
            aria-valuenow={Math.min(freeAbove, towardsFree)}
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, (towardsFree / freeAbove) * 100)}%` }} />
          </div>
          <span className="text-[0.875rem] font-semibold tabular-nums">{formatTaka(freeAbove)}</span>
        </div>
        <p className="mt-2 text-[0.9375rem] text-ink-soft">
          {t.freeDeliveryShortfall > 0 ? (
            <>
              Add <strong className="text-ink">{formatTaka(t.freeDeliveryShortfall)}</strong> more for free delivery anywhere in Bangladesh.
            </>
          ) : (
            <>
              <strong className="text-primary">Your delivery is free.</strong> Anywhere in Bangladesh.
            </>
          )}
        </p>
      </div>
    ) : null

  const undoNote = removed ? (
    <p role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-l-2 border-ink bg-card px-4 py-3 text-[0.9375rem]">
      <span>
        Removed <em className="font-display">{removed.title}</em>.
      </span>
      <button type="button" onClick={undo} className="link font-semibold">
        Undo
      </button>
    </p>
  ) : null

  // Always visible: a labelled field with its own Apply button, so nobody has to find it.
  const promo = (
    <div className="mt-5 border-t border-rule pt-4">
      {promotion ? (
        <div>
          <p className="text-[0.8125rem] font-semibold">Promotion code</p>
          <div className="mt-2 flex items-center justify-between gap-3 border rounded-ui border-primary bg-card px-3 py-2.5">
            <span className="text-[0.9375rem]">
              <span className="mr-1.5 text-primary" aria-hidden>
                ✓
              </span>
              <strong className="tracking-wide">{promotion.code}</strong>
              <span className="block text-[0.8125rem] text-ink-soft">
                {promoNeedsMore ? `Applies from ${formatTaka(promotion.minSubtotal ?? 0)} of books.` : t.discount ? `You save ${formatTaka(t.discount)}.` : 'Applied.'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => startTransition(() => removePromo())}
              aria-label={`Remove the code ${promotion.code}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-soft hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <form action={promoAction}>
          <label htmlFor="promoCode" className="text-[0.8125rem] font-semibold">
            Promotion code
          </label>
          <div className="mt-2 flex gap-2">
            <input
              // Keep what the shopper typed after a failed try, so a typo is easy to fix.
              key={promoState.tried ?? 'empty'}
              defaultValue={promoState.tried}
              id="promoCode"
              name="promoCode"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Enter code"
              aria-invalid={Boolean(promoState.message)}
              aria-describedby={promoState.message ? 'promo-error' : undefined}
              className={`h-11 min-w-0 flex-1 border rounded-ui bg-card px-3 uppercase placeholder:normal-case placeholder:text-ink-faint focus:border-primary focus:outline-none ${promoState.message ? 'border-[#9b2c1f]' : 'border-ink/60'}`}
            />
            <button type="submit" disabled={promoPending} className="btn btn-quiet !min-h-11 shrink-0 px-5">
              {promoPending ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {promoState.message ? (
            <p id="promo-error" className="mt-2 text-[0.8125rem] text-[#9b2c1f]">
              {promoState.message}
            </p>
          ) : null}
        </form>
      )}
    </div>
  )

  const gift = (
    <section className="mt-8 border rounded-ui border-rule p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(e) => {
            setWrap(e.target.checked)
            saveGift(e.target.checked, note)
          }}
          className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
        />
        <span>
          <span className="font-semibold">This is a gift</span> <span className="text-ink-soft">(+{formatTaka(rules.giftWrapFee)})</span>
          <span className="block text-[0.875rem] text-ink-soft">Wrapped in paper, with no prices on the slip. Add a message and we will write it on a card.</span>
        </span>
      </label>
      {wrap ? (
        <div className="mt-4 pl-7">
          <label htmlFor="giftNote" className="mb-1.5 block text-[0.8125rem] font-semibold">
            Message for the card <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea
            id="giftNote"
            rows={2}
            maxLength={240}
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteSaved(false)
            }}
            onBlur={() => note !== savedNote && saveGift(wrap, note)}
            className="w-full max-w-xl border rounded-ui border-ink/60 bg-card px-3 py-2 text-[0.9375rem]"
          />
          <p className="mt-1 text-[0.75rem] text-ink-faint" aria-live="polite">
            {noteSaved ? 'Saved.' : `${240 - note.length} characters left`}
          </p>
        </div>
      ) : null}
    </section>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:pb-0 md:pt-12">
      <div className={lines.length ? 'md:grid md:grid-cols-[1fr_22rem] md:items-start md:gap-12' : ''}>
        {/* Left: the books */}
        <div className="min-w-0">
          <h1 className="display text-[2.25rem] md:text-[2.75rem]">
            Your bag <span className="text-ink-faint">({count})</span>
          </h1>
          {freeBar}
          {undoNote}

          {lines.length === 0 ? (
            <div className="mt-10 border-t border-ink pt-8">
              <p className="font-display text-[1.375rem]">Your bag is empty.</p>
              <Link href="/collections" className="btn btn-primary mt-5">
                Find something to read <ArrowIcon />
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-8 hidden border-b border-ink pb-2 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-soft sm:grid sm:grid-cols-[4.5rem_1fr_auto_6.5rem_2.5rem] sm:gap-x-5">
                <span className="col-span-2">Book</span>
                <span className="w-[6.5rem] text-center">Quantity</span>
                <span className="text-right">Price</span>
                <span />
              </div>
              <ul className="mt-8 border-t border-ink sm:mt-0 sm:border-t-0">
                {lines.map((l) => {
                  const over = l.kind === 'in_stock' && l.quantity > l.max
                  return (
                    <li key={l.id} className="grid grid-cols-[4rem_1fr] gap-x-4 gap-y-3 border-b border-rule py-5 sm:grid-cols-[4.5rem_1fr_auto_6.5rem_2.5rem] sm:items-center sm:gap-x-5">
                      <Link href={`/book/${l.slug}`} className="row-span-2 flex justify-center self-start sm:row-span-1 sm:self-center">
                        {l.coverUrl ? (
                          <Image src={l.coverUrl} alt="" width={72} height={108} sizes="72px" className="h-[6rem] w-auto max-w-full rounded-[2px] object-contain shadow-book sm:h-[6.5rem]" />
                        ) : (
                          <span className="block h-[6rem] w-16 rounded-[2px] bg-primary" />
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/book/${l.slug}`} className="font-display text-[1.125rem] leading-snug hover:underline">
                          {l.title}
                        </Link>
                        {l.authorLine ? <p className="text-[0.875rem] text-ink-soft">{l.authorLine}</p> : null}
                        <p className="mt-1 text-[0.8125rem]">
                          <span className="font-semibold">{KIND[l.kind]}.</span> <span className="text-ink-soft">{l.note}</span>
                        </p>
                        {over ? (
                          <p className="mt-1 text-[0.8125rem] font-semibold text-[#9b2c1f]">
                            Only {l.max} {l.max === 1 ? 'copy is' : 'copies are'} left. Please reduce the quantity.
                          </p>
                        ) : null}
                        <p className="mt-1 text-[0.8125rem] text-ink-faint tabular-nums sm:hidden">{l.quantity > 1 ? `${formatTaka(l.unitPrice)} each` : ''}</p>
                      </div>
                      {/* On phones these sit in one row under the title; on wider screens each takes a column. */}
                      <div className="col-start-2 flex items-center justify-between gap-4 sm:contents">
                        <div className="sm:flex sm:w-[6.5rem] sm:justify-center">
                          <QtyStepper title={l.title} quantity={l.quantity} max={l.max} onChange={(q) => save(l, q)} minusRemoves={false} size="md" />
                        </div>
                        <p className="ml-auto text-right sm:ml-0">
                          <span className="block font-semibold tabular-nums">{formatTaka(l.unitPrice * l.quantity)}</span>
                          {l.quantity > 1 ? <span className="hidden text-[0.75rem] text-ink-faint tabular-nums sm:block">{formatTaka(l.unitPrice)} each</span> : null}
                        </p>
                        <button
                          type="button"
                          onClick={() => save(l, 0)}
                          aria-label={`Remove ${l.title} from the bag`}
                          title="Remove"
                          className="-mr-2 flex h-10 w-10 items-center justify-center text-ink-soft hover:text-[#9b2c1f] sm:mr-0"
                        >
                          <BinIcon size={18} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 text-[0.875rem] text-ink-soft">
                <Link href="/collections" className="link">
                  Keep browsing
                </Link>
              </p>
              {gift}
            </>
          )}
        </div>

        {/* Right: summary, promotion code and checkout, level with the top of the page */}
        {lines.length ? (
          <aside className="mt-10 md:sticky md:top-36 md:mt-2">
            <section className="border rounded-ui border-ink p-5">
              <h2 className="display text-[1.5rem]">Order summary</h2>
              <dl className="mt-4 space-y-2 text-[0.9375rem]">
                <div className="flex justify-between">
                  <dt>
                    Books <span className="text-ink-soft">({count})</span>
                  </dt>
                  <dd className="tabular-nums">{formatTaka(t.subtotal)}</dd>
                </div>
                {t.discount ? (
                  <div className="flex justify-between text-primary">
                    <dt>Discount ({promotion?.code})</dt>
                    <dd className="tabular-nums">−{formatTaka(t.discount)}</dd>
                  </div>
                ) : null}
                {t.giftWrap ? (
                  <div className="flex justify-between">
                    <dt>Gift wrap</dt>
                    <dd className="tabular-nums">{formatTaka(t.giftWrap)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>Delivery</dt>
                  <dd className="text-right tabular-nums">
                    {deliveryFree ? (
                      <span className="font-semibold text-primary">Free</span>
                    ) : (
                      <>
                        {formatTaka(rules.insideDhakaFee)} Dhaka
                        <span className="block text-[0.8125rem] text-ink-soft">{formatTaka(rules.outsideDhakaFee)} elsewhere</span>
                      </>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-ink pt-3">
                  <dt className="font-semibold">{deliveryFree ? 'Total' : 'Total before delivery'}</dt>
                  <dd className="font-display text-[1.5rem] tabular-nums">{formatTaka(total)}</dd>
                </div>
              </dl>
              {t.advanceDue > 0 ? (
                <p className="mt-3 text-[0.8125rem] text-ink-soft">
                  {lines.some((l) => l.kind !== 'in_stock')
                    ? 'Some books are ordered in for you, so part of the price is paid in advance at checkout.'
                    : `For orders over ${formatTaka(rules.codCeiling)}, part of the price is paid in advance at checkout.`}
                </p>
              ) : null}

              {promo}

              {tooMany.length ? (
                <p className="mt-5 text-[0.875rem] font-semibold text-[#9b2c1f]">Reduce the quantities marked in red to continue.</p>
              ) : (
                <Link href="/checkout" className="btn btn-primary mt-5 w-full">
                  Continue to checkout <ArrowIcon />
                </Link>
              )}
            </section>

            <ul className="mt-4 space-y-1.5 px-1 text-[0.8125rem] text-ink-soft">
              <li>✓ Every book is an original publisher’s edition</li>
              <li>✓ Cash on delivery for books in stock</li>
              <li>
                ✓ Questions?{' '}
                <Link href="/help" className="link">
                  We are happy to help
                </Link>
              </li>
            </ul>

            {/* Phones: the total and checkout stay in reach at the bottom of the screen. */}
            {!tooMany.length ? (
              <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-ink bg-paper px-4 py-3 shadow-[0_-12px_24px_-16px_rgb(26_29_27/0.35)] md:hidden">
                <span>
                  <span className="block text-[0.75rem] text-ink-soft">{deliveryFree ? 'Total' : 'Before delivery'}</span>
                  <span className="font-display text-[1.375rem] leading-none tabular-nums">{formatTaka(total)}</span>
                </span>
                <Link href="/checkout" className="btn btn-primary">
                  Checkout <ArrowIcon />
                </Link>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

const TruckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" strokeLinejoin="round" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </svg>
)
