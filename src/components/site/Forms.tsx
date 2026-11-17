'use client'

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
    title: 'Pay the advance now, the rest on delivery',
    body: (t, pct) =>
      `Pay ${formatTaka(t.advanceDue)} now: ${pct}% of the books we order in for you. Everything else, including books in stock, is cash on delivery.`,
  },
  full: { title: 'Pay in full now', body: (t) => `Pay ${formatTaka(t.total)} now. Nothing to pay on delivery.` },
}

export const CheckoutForm: React.FC<{
  customer: { phone: string; name?: string | null; email?: string | null; district?: string | null; area?: string | null; street?: string | null }
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
  /** The books, priced, so the parcels can be worked out as choices change. */
  lines: PricedLine[]
}> = ({ customer, rules, totals, plans, withPoints, points, methods, bkashNumber, needsAdvanceBecause, lines }) => {
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
  const splittable = canSplit(lines)
  const parcels = planParcels(lines, t, chosen, delivery)
  const payNow = chosen === 'full' ? t.total : chosen === 'advance' ? t.advanceDue : 0

  return (
    <form action={action} className="md:grid md:grid-cols-[1fr_22rem] md:items-start md:gap-12">
      <div className="space-y-10">
        <section>
          <h2 className="display border-t border-ink pt-3 text-[1.5rem]">1. Your details</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-soft">
            Signed in as <strong className="text-ink">{customer.phone}</strong>. Order updates go to this number.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <label className="mt-2 flex items-start gap-2 text-[0.8125rem] text-ink-soft">
                <input type="checkbox" name="newsletter" className="mt-0.5 accent-[var(--color-primary)]" />
                Send me the AFTERWORD newsletter, about once a month. Unsubscribe any time.
              </label>
            </div>
          </div>
        </section>

        <section>
          <h2 className="display border-t border-ink pt-3 text-[1.5rem]">2. Delivery address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className={label} htmlFor="area">
                Area or thana
              </label>
              <input id="area" name="area" required defaultValue={customer.area ?? ''} placeholder="e.g. Dhanmondi" className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="street">
                House, road and landmark
              </label>
              <textarea id="street" name="street" required rows={2} defaultValue={customer.street ?? ''} className={`${field} h-auto py-2.5`} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="deliveryNote">
                Note for the courier <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="deliveryNote" name="deliveryNote" maxLength={160} className={field} />
            </div>
          </div>
          <p className="mt-4 border rounded-ui border-rule px-4 py-3 text-[0.9375rem]">
            {zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}:{' '}
            <strong>{t.delivery === 0 ? 'free delivery' : formatTaka(t.delivery)}</strong>, {zone === 'inside_dhaka' ? rules.insideDays : rules.outsideDays}{' '}
            after dispatch.
          </p>
        </section>

        {points.balance > 0 ? (
          <section>
            <h2 className="display border-t border-ink pt-3 text-[1.5rem]">Reward points</h2>
            {points.usable > 0 ? (
              <label className={`mt-4 flex cursor-pointer gap-3 border rounded-ui px-4 py-3.5 ${usePoints ? 'border-primary bg-card' : 'border-rule'}`}>
                <input type="checkbox" name="usePoints" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="mt-1 accent-[var(--color-primary)]" />
                <span>
                  <span className="block font-semibold">Use {points.usable} of my {points.balance} points</span>
                  <span className="block text-[0.9375rem] text-ink-soft">Takes {formatTaka(points.usable)} off the books.</span>
                </span>
              </label>
            ) : (
              <p className="mt-2 text-[0.9375rem] text-ink-soft">
                You have {points.balance} points. They can be spent once you have {points.minimum}.
              </p>
            )}
          </section>
        ) : null}

        {splittable ? (
          <section>
            <h2 className="display border-t border-ink pt-3 text-[1.5rem]">Sending your books</h2>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">
              Some of your books are in stock and some we order in for you. One delivery fee either way.
            </p>
            <div className="mt-4 space-y-2">
              {(
                [
                  ['split', 'Send the books in stock now', 'The rest follow in a second parcel when they arrive, at no extra delivery charge.'],
                  ['together', 'Send everything together', 'One parcel, once all your books are here.'],
                ] as const
              ).map(([value, title, body]) => (
                <label key={value} className={`flex cursor-pointer gap-3 border rounded-ui px-4 py-3.5 ${delivery === value ? 'border-primary bg-card' : 'border-rule'}`}>
                  <input type="radio" name="deliveryPlan" value={value} checked={delivery === value} onChange={() => setDelivery(value)} className="mt-1 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-[0.9375rem] text-ink-soft">{body}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="display border-t border-ink pt-3 text-[1.5rem]">3. Payment</h2>
          {needsAdvanceBecause && t.advanceDue > 0 ? <p className="mt-2 text-[0.9375rem] text-ink-soft">{needsAdvanceBecause}</p> : null}
          {offered.length === 0 ? (
            <p className="mt-4 border rounded-ui border-rule px-4 py-3">
              This order needs an advance, and online payment is not connected yet. Please message us to arrange it.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {offered.map((p) => (
                <label key={p} className={`flex cursor-pointer gap-3 border rounded-ui px-4 py-3.5 ${chosen === p ? 'border-primary bg-card' : 'border-rule'}`}>
                  <input type="radio" name="paymentPlan" value={p} checked={chosen === p} onChange={() => setPlan(p)} className="mt-1 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block font-semibold">{PLAN_COPY[p].title}</span>
                    <span className="block text-[0.9375rem] text-ink-soft">{PLAN_COPY[p].body(t, rules.advancePercent)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {chosen !== 'cod' && methods.length > 1 ? (
            <fieldset className="mt-5">
              <legend className={label}>Pay with</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {methods.map((m) => (
                  <label key={m} className={`flex cursor-pointer items-center gap-2.5 border rounded-ui px-3 py-3 text-[0.9375rem] ${via === m ? 'border-primary bg-card' : 'border-rule'}`}>
                    <input type="radio" name="payNowVia" value={m} checked={via === m} onChange={() => setMethod(m)} className="accent-[var(--color-primary)]" />
                    {METHOD_LABEL[m]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : chosen !== 'cod' && via ? (
            <input type="hidden" name="payNowVia" value={via} />
          ) : null}
          {chosen !== 'cod' && via === 'bkash' ? (
            <p className="mt-4 text-[0.9375rem] text-ink-soft">You will be taken to bKash to approve the payment with your bKash PIN, then brought back here.</p>
          ) : null}
          {chosen !== 'cod' && via === 'bkash_manual' ? (
            <div className="mt-4 bg-paper-deep px-4 py-4">
              <p className="text-[0.9375rem]">
                Send <strong>{formatTaka(chosen === 'full' ? t.total : t.advanceDue)}</strong> by bKash (Send Money) to{' '}
                <strong className="tabular-nums">{bkashNumber}</strong>, then tell us the number you sent from and the transaction
                ID. We check it before confirming your order.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
                    bKash transaction ID
                  </label>
                  <input id="paymentReference" name="paymentReference" required maxLength={40} placeholder="e.g. 9A7B6C5D4E" className={`${field} uppercase placeholder:normal-case`} />
                </div>
              </div>
            </div>
          ) : null}
          {chosen !== 'cod' && via === 'sslcommerz' ? (
            <p className="mt-4 text-[0.9375rem] text-ink-soft">You will be taken to our payment partner’s secure page to pay by card, bKash or bank.</p>
          ) : null}
        </section>
      </div>

      <aside className="mt-10 border rounded-ui border-ink p-5 md:sticky md:top-36 md:mt-0">
        <h2 className="eyebrow">Order total</h2>
        <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
          <div className="flex justify-between">
            <dt>Books</dt>
            <dd className="tabular-nums">{formatTaka(t.subtotal)}</dd>
          </div>
          {t.discount ? (
            <div className="flex justify-between text-primary">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{formatTaka(t.discount)}</dd>
            </div>
          ) : null}
          {t.rewards ? (
            <div className="flex justify-between text-primary">
              <dt>Reward points</dt>
              <dd className="tabular-nums">−{formatTaka(t.rewards)}</dd>
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
            <dd className="tabular-nums">{t.delivery === 0 ? 'Free' : formatTaka(t.delivery)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink pt-2 font-display text-[1.375rem]">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatTaka(t.total)}</dd>
          </div>
        </dl>
        {/* When the money is paid: now, and to the courier for each parcel. */}
        {payNow > 0 || parcels.length > 1 ? (
          <dl className="mt-4 space-y-1.5 border-t border-rule pt-3 text-[0.875rem]">
            {payNow > 0 ? (
              <div className="flex justify-between font-semibold">
                <dt>Pay now by bKash</dt>
                <dd className="tabular-nums">{formatTaka(payNow)}</dd>
              </div>
            ) : null}
            {parcels.map((p, i) => (
              <div key={i} className="flex justify-between gap-3">
                <dt className="text-ink-soft">
                  {parcels.length > 1 ? (p.later ? 'On delivery of the books we order in' : 'On delivery of the books in stock') : 'On delivery'}
                </dt>
                <dd className="tabular-nums">{formatTaka(p.collect)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="mt-4 space-y-3">
          <ErrorNote message={state.message} />
          <button type="submit" disabled={pending || offered.length === 0} className="btn btn-primary w-full">
            {pending ? 'Placing your order…' : chosen === 'cod' ? 'Place order' : 'Place order and pay'}
          </button>
          <p className="text-center text-[0.75rem] text-ink-faint">Every book is an original edition. Prices include all charges.</p>
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
