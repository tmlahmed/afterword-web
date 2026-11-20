'use client'

import Image from 'next/image'
import React, { useActionState, useState } from 'react'

import { addToBag, type AddToBagState, type CheckoutState, joinNewsletter, type NewsletterState, placeOrder, type RequestState, type ReviewState, signIn, type SignInState, submitRequest, submitReview } from '../../app/(frontend)/actions'
import { canSplit, type DeliveryPlan, DISTRICTS, type PaymentPlan, planParcels, type PricedLine, type ShopRules, type Totals } from '../../lib/orders/pricing'
import type { PayMethod } from '../../lib/payments'
import { formatTaka } from '../../lib/pricing'
import { BAG_ADDED_EVENT } from './MiniBag'

const field = 'h-12 w-full rounded-ui border border-ink/60 bg-card px-3 text-base placeholder:text-ink-faint focus:border-primary focus:outline-none'
const label = 'mb-1.5 block text-[0.8125rem] font-semibold'

const ErrorNote: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <p role="alert" className="border-l-2 border-[#9b2c1f] bg-[#9b2c1f]/8 px-3 py-2.5 text-[0.9375rem] text-[#7a2218]">
      {message}
    </p>
  ) : null

// --- Sign-in with a one-time code --------------------------------------------

export const SignInForm: React.FC<{ next: string }> = ({ next }) => {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { step: 'phone' })
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="step" value={state.step} />
      {state.step === 'phone' ? (
        <div key="phone">
          <label className={label} htmlFor="phone">
            Mobile number
          </label>
          <input id="phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" required autoFocus className={field} />
          <p className="mt-2 text-[0.8125rem] text-ink-soft">We will text you a six-digit code. No password to remember.</p>
        </div>
      ) : (
        <div key="code">
          <input type="hidden" name="phone" value={state.phone ?? ''} />
          <input type="hidden" name="devCode" value={state.devCode ?? ''} />
          <label className={label} htmlFor="code">
            Code sent to {state.phone}
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••" required autoFocus className={`${field} tracking-[0.5em]`} />
          {state.devCode ? (
            <p className="mt-2 border rounded-ui border-dashed border-accent px-3 py-2 text-[0.8125rem]">
              Preview site: no SMS service is connected yet, so the code is shown here instead. Your code is{' '}
              <strong className="tabular-nums">{state.devCode}</strong>.
            </p>
          ) : null}
        </div>
      )}
      <ErrorNote message={state.message} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? 'One moment…' : state.step === 'phone' ? 'Send me a code' : 'Sign in'}
      </button>
    </form>
  )
}

// --- Checkout ----------------------------------------------------------------

const METHOD_LABEL: Record<PayMethod, string> = { bkash: 'bKash', sslcommerz: 'Card or other wallet', bkash_manual: 'bKash Send Money' }

const PLAN_COPY: Record<PaymentPlan, { title: string; body: (t: Totals, pct: number) => string }> = {
  cod: { title: 'Cash on delivery', body: (t) => `Pay ${formatTaka(t.total)} to the courier when your books arrive.` },
  advance: {
    title: 'Advance now, the rest on delivery',
    body: (t, pct) => `${formatTaka(t.advanceDue)} now (${pct}% of the books we order in). Everything else is cash on delivery.`,
  },
  full: { title: 'Pay in full now', body: (t) => `${formatTaka(t.total)} now. Nothing to pay on delivery.` },
}

const KIND_TAG: Record<CheckoutItem['kind'], string | null> = { in_stock: null, pre_order: 'Pre-order', on_request: 'Ordered in' }

export type CheckoutItem = {
  id: number
  title: string
  authorLine?: string | null
  coverUrl?: string | null
  unitPrice: number
  quantity: number
  kind: 'in_stock' | 'pre_order' | 'on_request'
}

/** One step of the checkout: a titled panel. */
const Step: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="rounded-ui border border-rule bg-paper p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-[1.25rem] font-medium">{title}</h2>
      {aside ? <div className="text-[0.8125rem] text-ink-soft">{aside}</div> : null}
    </div>
    {children}
  </section>
)

/** A choice drawn as a card: radio or checkbox, a title and one line under it. */
const Choice: React.FC<{
  type?: 'radio' | 'checkbox'
  name: string
  value?: string
  checked: boolean
  onChange: (checked: boolean) => void
  title: React.ReactNode
  body?: React.ReactNode
  side?: React.ReactNode
}> = ({ type = 'radio', name, value, checked, onChange, title, body, side }) => (
  <label
    className={`flex cursor-pointer items-start gap-3 rounded-ui border px-4 py-3.5 transition-colors ${
      checked ? 'border-ink bg-card shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-rule hover:border-ink/50'
    }`}
  >
    <input
      type={type}
      name={name}
      value={value}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-[0.3rem] size-4 shrink-0 accent-[var(--color-primary)]"
    />
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      {body ? <span className="mt-0.5 block text-[0.875rem] leading-snug text-ink-soft">{body}</span> : null}
    </span>
    {side ? <span className="shrink-0 text-[0.9375rem] font-medium tabular-nums">{side}</span> : null}
  </label>
)

const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; className?: string }> = ({ label: name, value, className = '' }) => (
  <div className={`flex justify-between gap-4 ${className}`}>
    <dt>{name}</dt>
    <dd className="tabular-nums">{value}</dd>
  </div>
)

export const CheckoutForm: React.FC<{
  customer: { phone: string; name?: string | null; email?: string | null; district?: string | null; street?: string | null }
  rules: ShopRules & { insideDays: string; outsideDays: string }
  /** Totals for each zone, worked out on the server. */
  totals: { inside_dhaka: Totals; outside_dhaka: Totals }
  plans: { inside_dhaka: PaymentPlan[]; outside_dhaka: PaymentPlan[] }
  /** The same, with the customer's reward points used. */
  withPoints: { totals: { inside_dhaka: Totals; outside_dhaka: Totals }; plans: { inside_dhaka: PaymentPlan[]; outside_dhaka: PaymentPlan[] } }
  points: { balance: number; usable: number; minimum: number }
  /** Ways to pay now that are switched on, in the order to offer them. */
  methods: PayMethod[]
  bkashNumber?: string | null
  needsAdvanceBecause: string | null
  /** The books, for the order summary and for working out the parcels as choices change. */
  items: CheckoutItem[]
}> = ({ customer, rules, totals, plans, withPoints, points, methods, bkashNumber, needsAdvanceBecause, items }) => {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {})
  const [district, setDistrict] = useState(customer.district ?? 'Dhaka')
  const [usePoints, setUsePoints] = useState(false)
  const zone = district === 'Dhaka' ? 'inside_dhaka' : 'outside_dhaka'
  const spending = usePoints && points.usable > 0
  const t = spending ? withPoints.totals[zone] : totals[zone]
  const offered = (spending ? withPoints.plans : plans)[zone].filter((p) => p === 'cod' || methods.length > 0)
  const [plan, setPlan] = useState<PaymentPlan>(offered[0] ?? 'cod')
  const chosen = offered.includes(plan) ? plan : (offered[0] ?? 'cod')
  const [method, setMethod] = useState<PayMethod | undefined>(methods[0])
  const via = method && methods.includes(method) ? method : methods[0]
  const [delivery, setDelivery] = useState<DeliveryPlan>('split')
  const lines: PricedLine[] = items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, kind: i.kind }))
  const splittable = canSplit(lines)
  const parcels = planParcels(lines, t, chosen, delivery)
  const payNow = chosen === 'full' ? t.total : chosen === 'advance' ? t.advanceDue : 0
  const count = items.reduce((n, i) => n + i.quantity, 0)
  const days = zone === 'inside_dhaka' ? rules.insideDays : rules.outsideDays

  return (
    <form action={action} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10">
      <div className="space-y-5">
        <Step title="Contact information" aside={<>Signed in as <strong className="font-semibold text-ink tabular-nums">{customer.phone.replace(/^\+88/, '')}</strong></>}>
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="name">
                Full name
              </label>
              <input id="name" name="name" autoComplete="name" required defaultValue={customer.name ?? ''} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="email">
                Email <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="email" name="email" type="email" autoComplete="email" defaultValue={customer.email ?? ''} className={field} />
            </div>
            <label className="flex items-start gap-2.5 text-[0.875rem] text-ink-soft">
              <input type="checkbox" name="newsletter" className="mt-0.5 size-4 accent-[var(--color-primary)]" />
              Send me the AFTERWORD newsletter, about once a month.
            </label>
            <p className="text-[0.8125rem] text-ink-faint">Order updates are sent by text to your mobile number.</p>
          </div>
        </Step>

        <Step title="Delivery">
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="street">
                House, road and landmark
              </label>
              <textarea
                id="street"
                name="street"
                required
                rows={2}
                autoComplete="street-address"
                defaultValue={customer.street ?? ''}
                placeholder="e.g. House 12, Road 5, Dhanmondi, near the mosque"
                className={`${field} h-auto py-2.5`}
              />
            </div>
            <div>
              <label className={label} htmlFor="district">
                District
              </label>
              <select id="district" name="district" required value={district} onChange={(e) => setDistrict(e.target.value)} className={field}>
                {DISTRICTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-ui bg-paper-deep px-4 py-3 text-[0.9375rem]">
              <span>
                {zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}
                <span className="text-ink-soft"> · {days} after dispatch</span>
              </span>
              <strong className="font-medium tabular-nums">{t.delivery === 0 ? 'Free' : formatTaka(t.delivery)}</strong>
            </div>
            <div>
              <label className={label} htmlFor="deliveryNote">
                Note for the courier <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="deliveryNote" name="deliveryNote" maxLength={160} placeholder="e.g. Call before coming" className={field} />
            </div>
          </div>
        </Step>

        {splittable ? (
          <Step title="Shipment" aside="One delivery fee either way">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Choice
                name="deliveryPlan"
                value="split"
                checked={delivery === 'split'}
                onChange={() => setDelivery('split')}
                title="Two parcels"
                body="Books in stock come now; the books we order in follow when they arrive."
              />
              <Choice
                name="deliveryPlan"
                value="together"
                checked={delivery === 'together'}
                onChange={() => setDelivery('together')}
                title="One parcel"
                body="Everything together, once all your books are here."
              />
            </div>
          </Step>
        ) : null}

        {points.balance > 0 ? (
          <Step title="Reward points" aside={`${points.balance} points`}>
            {points.usable > 0 ? (
              <Choice
                type="checkbox"
                name="usePoints"
                checked={usePoints}
                onChange={setUsePoints}
                title={`Use ${points.usable} points`}
                body="One point is worth ৳1."
                side={`−${formatTaka(points.usable)}`}
              />
            ) : (
              <p className="text-[0.9375rem] text-ink-soft">Points can be spent once you have {points.minimum}.</p>
            )}
          </Step>
        ) : null}

        <Step title="Payment">
          {needsAdvanceBecause && t.advanceDue > 0 ? <p className="-mt-2 mb-4 text-[0.875rem] text-ink-soft">{needsAdvanceBecause}</p> : null}
          {offered.length === 0 ? (
            <p className="rounded-ui bg-paper-deep px-4 py-3 text-[0.9375rem]">
              This order needs an advance, and online payment is not connected yet. Please message us to arrange it.
            </p>
          ) : (
            <div className="space-y-2.5">
              {offered.map((p) => (
                <Choice
                  key={p}
                  name="paymentPlan"
                  value={p}
                  checked={chosen === p}
                  onChange={() => setPlan(p)}
                  title={PLAN_COPY[p].title}
                  body={PLAN_COPY[p].body(t, rules.advancePercent)}
                />
              ))}
            </div>
          )}

          {chosen !== 'cod' && methods.length > 1 ? (
            <fieldset className="mt-5">
              <legend className={label}>Pay with</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {methods.map((m) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-ui border px-3 py-3 text-[0.9375rem] ${
                      via === m ? 'border-ink bg-card shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-rule hover:border-ink/50'
                    }`}
                  >
                    <input type="radio" name="payNowVia" value={m} checked={via === m} onChange={() => setMethod(m)} className="size-4 accent-[var(--color-primary)]" />
                    {METHOD_LABEL[m]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : chosen !== 'cod' && via ? (
            <input type="hidden" name="payNowVia" value={via} />
          ) : null}

          {chosen !== 'cod' && via === 'bkash' ? (
            <p className="mt-4 text-[0.875rem] text-ink-soft">You will approve the payment in bKash with your PIN, then come back here.</p>
          ) : null}
          {chosen !== 'cod' && via === 'sslcommerz' ? (
            <p className="mt-4 text-[0.875rem] text-ink-soft">You will pay on our payment partner’s secure page, then come back here.</p>
          ) : null}
          {chosen !== 'cod' && via === 'bkash_manual' ? (
            <div className="mt-5 rounded-ui border border-rule bg-card p-4 sm:p-5">
              <ol className="space-y-2 text-[0.9375rem]">
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-paper">1</span>
                  <span>
                    Send <strong className="tabular-nums">{formatTaka(payNow)}</strong> by bKash <em className="not-italic font-medium">Send Money</em> to{' '}
                    <strong className="tabular-nums">{bkashNumber}</strong>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-paper">2</span>
                  <span>Enter the number you sent from and the transaction ID. We check it before confirming your order.</span>
                </li>
              </ol>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="paymentSender">
                    bKash number you sent from
                  </label>
                  <input
                    id="paymentSender"
                    name="paymentSender"
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={20}
                    placeholder="01XXXXXXXXX"
                    defaultValue={customer.phone.replace(/^\+88/, '')}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="paymentReference">
                    Transaction ID
                  </label>
                  <input id="paymentReference" name="paymentReference" required maxLength={40} placeholder="e.g. 9A7B6C5D4E" className={`${field} uppercase placeholder:normal-case`} />
                </div>
              </div>
            </div>
          ) : null}
        </Step>
      </div>

      <aside className="rounded-ui border border-rule bg-card p-5 sm:p-6 lg:sticky lg:top-32">
        <h2 className="font-display text-[1.25rem] font-medium">Order summary</h2>

        <ul className="mt-4 max-h-[17rem] space-y-3.5 overflow-y-auto pr-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3.5">
              <span className="relative shrink-0">
                {i.coverUrl ? (
                  <Image src={i.coverUrl} alt="" width={44} height={66} sizes="44px" className="h-[3.75rem] w-[2.6rem] rounded-[2px] object-contain shadow-book" />
                ) : (
                  <span className="block h-[3.75rem] w-[2.6rem] rounded-[2px] bg-paper-deep" />
                )}
                {i.quantity > 1 ? (
                  <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-semibold text-paper tabular-nums">
                    {i.quantity}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[0.9375rem] font-medium">{i.title}</span>
                <span className="line-clamp-1 text-[0.8125rem] text-ink-soft">
                  {i.authorLine}
                  {KIND_TAG[i.kind] ? <span className="ml-1.5 text-accent">· {KIND_TAG[i.kind]}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-[0.9375rem] tabular-nums">{formatTaka(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-2 border-t border-rule pt-4 text-[0.9375rem]">
          <Row label={`Items (${count})`} value={formatTaka(t.subtotal)} />
          {t.discount ? <Row label="Discount" value={`−${formatTaka(t.discount)}`} className="text-accent" /> : null}
          {t.rewards ? <Row label="Reward points" value={`−${formatTaka(t.rewards)}`} className="text-accent" /> : null}
          {t.giftWrap ? <Row label="Gift wrap" value={formatTaka(t.giftWrap)} /> : null}
          <Row label="Delivery fee" value={t.delivery === 0 ? 'Free' : formatTaka(t.delivery)} />
          <Row label="Total" value={formatTaka(t.total)} className="mt-1 border-t border-rule pt-3 font-display text-[1.375rem] font-medium" />
        </dl>

        {/* When the money is paid: now, and to the courier for each parcel. */}
        <dl className="mt-4 space-y-1.5 rounded-ui bg-paper-deep px-4 py-3 text-[0.875rem]">
          {payNow > 0 ? <Row label={`Pay now${via ? ` by ${via === 'sslcommerz' ? 'card or wallet' : 'bKash'}` : ''}`} value={formatTaka(payNow)} className="font-semibold" /> : null}
          {parcels.map((p, i) =>
            p.collect <= 0 && parcels.length === 1 ? null : (
              <Row
                key={i}
                label={<span className="text-ink-soft">{parcels.length > 1 ? (p.later ? 'COD of the books we order in' : 'COD of the books in stock') : 'Cash on delivery'}</span>}
                value={formatTaka(p.collect)}
              />
            ),
          )}
        </dl>

        <div className="mt-5 space-y-3">
          <ErrorNote message={state.message} />
          <button type="submit" disabled={pending || offered.length === 0} className="btn btn-primary w-full">
            {pending ? 'Placing your order…' : chosen === 'cod' ? 'Place order' : 'Place order and pay'}
          </button>
          <p className="text-center text-[0.75rem] text-ink-faint">Original editions only. Prices include all charges.</p>
        </div>
      </aside>
    </form>
  )
}

// --- On Request --------------------------------------------------------------

export const RequestForm: React.FC<{ signedIn: boolean; name?: string | null; prefill?: string }> = ({ signedIn, name, prefill }) => {
  const [state, action, pending] = useActionState<RequestState, FormData>(submitRequest, {})
  if (state.done)
    return (
      <div className="border rounded-ui border-primary px-6 py-8">
        <p className="font-display text-[1.375rem]">Thank you. We have your request.</p>
        <p className="mt-2 text-ink-soft">
          We will look for the book and text you a price and an arrival estimate, usually within two working days. Nothing is charged
          until you decide to order.
        </p>
      </div>
    )
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={label} htmlFor="wanted">
          Which book?
        </label>
        <input id="wanted" name="wanted" required defaultValue={prefill} placeholder="Title and author" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="isbn">
            ISBN <span className="font-normal text-ink-soft">(if you know it)</span>
          </label>
          <input id="isbn" name="isbn" inputMode="numeric" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="rname">
            Your name
          </label>
          <input id="rname" name="name" required defaultValue={name ?? ''} autoComplete="name" className={field} />
        </div>
      </div>
      {!signedIn ? (
        <div>
          <label className={label} htmlFor="rphone">
            Mobile number
          </label>
          <input id="rphone" name="phone" type="tel" required placeholder="01XXXXXXXXX" autoComplete="tel" className={field} />
        </div>
      ) : null}
      <div>
        <label className={label} htmlFor="note">
          Anything else? <span className="font-normal text-ink-soft">(edition, hardback or paperback, how soon)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={500} className={`${field} h-auto py-2.5`} />
      </div>
      <ErrorNote message={state.message} />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}

// --- Reviews -------------------------------------------------------------------

export const ReviewForm: React.FC<{ edition: number }> = ({ edition }) => {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, {})
  const [rating, setRating] = useState(0)
  if (state.done)
    return (
      <div className="border rounded-ui border-primary px-5 py-6">
        <p className="font-display text-[1.25rem]">Thank you for your review.</p>
        <p className="mt-1.5 text-ink-soft">A bookseller reads every review before it appears, usually within a day or two.</p>
      </div>
    )
  return (
    <form action={action} className="max-w-[38rem] space-y-4 bg-paper-deep px-5 py-6">
      <p className="font-display text-[1.25rem]">You bought this book. What did you think?</p>
      <input type="hidden" name="edition" value={edition} />
      <fieldset>
        <legend className={label}>Your rating</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-1" title={`${n} out of 5`}>
              <input type="radio" name="rating" value={n} required className="sr-only" onChange={() => setRating(n)} />
              <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden fill={n <= rating ? 'var(--color-ink)' : 'none'} stroke="var(--color-ink)" strokeWidth="1.5">
                <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">{n} out of 5</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={label} htmlFor="rtitle">
          Title
        </label>
        <input id="rtitle" name="title" required maxLength={90} placeholder="In a few words" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="rbody">
          Your review
        </label>
        <textarea id="rbody" name="body" required minLength={20} maxLength={2000} rows={5} className={`${field} h-auto py-2.5`} placeholder="What should another reader know? Please keep the ending a secret." />
      </div>
      <div>
        <label className={label} htmlFor="rname">
          Show my name as <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input id="rname" name="displayName" maxLength={40} placeholder="e.g. Nusrat K." className={field} />
      </div>
      <ErrorNote message={state.message} />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Sending…' : 'Send review'}
      </button>
    </form>
  )
}

// --- Newsletter ----------------------------------------------------------------

export const NewsletterForm: React.FC = () => {
  const [state, action, pending] = useActionState<NewsletterState, FormData>(joinNewsletter, {})
  if (state.done) return <p className="font-display text-[1.125rem]">Thank you. The next letter is on its way to you.</p>
  return (
    <form action={action} className="max-w-md">
      <label htmlFor="newsletter-email" className="eyebrow !text-ink">
        The newsletter
      </label>
      <p className="mt-2 text-[0.9375rem] text-ink-soft">New arrivals and booksellers’ picks, about once a month.</p>
      <div className="mt-3 flex gap-2">
        <input id="newsletter-email" name="email" type="email" autoComplete="email" required placeholder="Your email" className={`${field} min-w-0 flex-1`} />
        <button type="submit" disabled={pending} className="btn btn-primary shrink-0">
          {pending ? '…' : 'Sign up'}
        </button>
      </div>
      {state.message ? (
        <div className="mt-2">
          <ErrorNote message={state.message} />
        </div>
      ) : null}
    </form>
  )
}

// --- Add to bag ------------------------------------------------------------------

/**
 * The buy button. Adds a copy without leaving the page: the button says "Added" for a moment
 * and the bag opens from the header to show it.
 */
export const AddToBag: React.FC<{ edition: number; label: string }> = ({ edition, label }) => {
  const [flash, setFlash] = useState(0)
  const announced = React.useRef(0)
  const [state, action, pending] = useActionState<AddToBagState, FormData>(async (prev, form) => {
    const result = await addToBag(prev, form)
    if (result.inBag && !result.message) setFlash(result.at ?? Date.now())
    return result
  }, {})

  // Once the page has caught up (the header's bag is fresh), open the bag and let the
  // button say "Added" for a couple of seconds.
  React.useEffect(() => {
    if (pending || !flash) return
    if (announced.current !== flash) {
      announced.current = flash
      window.dispatchEvent(new CustomEvent(BAG_ADDED_EVENT))
    }
    const t = setTimeout(() => setFlash(0), 2200)
    return () => clearTimeout(t)
  }, [pending, flash])

  return (
    <div className="mt-5">
      <form action={action}>
        <input type="hidden" name="edition" value={edition} />
        <button type="submit" disabled={pending} aria-live="polite" className="btn btn-primary w-full gap-2">
          {pending ? (
            'Adding…'
          ) : flash ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Added to your bag
            </>
          ) : (
            label
          )}
        </button>
      </form>
      {state.message ? (
        <div className="mt-3">
          <ErrorNote message={state.message} />
        </div>
      ) : null}
    </div>
  )
}
