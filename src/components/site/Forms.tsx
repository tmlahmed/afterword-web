'use client'

import Image from 'next/image'
import React, { useActionState, useState } from 'react'
import { createPortal } from 'react-dom'

import { addToBag, type AddToBagState, type CheckoutState, joinNewsletter, type NewsletterState, placeOrder, type RequestState, type ReviewState, signIn, type SignInState, submitRequest, submitReview } from '../../app/(frontend)/actions'
import { canSplit, type DeliveryPlan, DISTRICTS, parcelCount, type PaymentPlan, planParcels, type PricedLine, type ShopRules, totalsForParcels, type Totals } from '../../lib/orders/pricing'
import type { PayMethod } from '../../lib/payments'
import { formatTaka } from '../../lib/pricing'
import { CloseIcon } from './Brand'
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

const fieldError = 'border-[#b42318] bg-[#b42318]/[0.04] focus:border-[#b42318] shadow-[inset_0_0_0_1px_#b42318]'

/** The message under a field the customer still has to fill in. */
const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] font-medium text-[#b42318]">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="mt-[0.15rem] shrink-0" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V5A.75.75 0 0 1 8 4.25Zm0 7.5a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
      </svg>
      {message}
    </p>
  ) : null

/** What to say when a required checkout field is left empty or filled in wrongly. */
const CHECKOUT_MISSING: Record<string, string> = {
  name: 'Enter your full name.',
  email: 'Enter a valid email address, or leave it empty.',
  street: 'Enter your house, road and area so the courier can find you.',
  district: 'Choose your district.',
  paymentSender: 'Enter the number or account you paid from, so we can find your payment.',
}

const ExpandIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5" />
  </svg>
)

/**
 * The shop's Bangla QR at checkout. The expand button shows it large, so a customer on a laptop
 * can scan it with their phone. Close with the button, Escape, or a click anywhere but the code.
 */
const QrCard: React.FC<{ qr: { svg: string; png: string; name: string | null }; number?: string | null }> = ({ qr, number }) => {
  const [open, setOpen] = useState(false)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const openerRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    const opener = openerRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [open])
  // Drawn on the server from the shop's own QR code; nothing customer-supplied.
  const code = (className: string) => <div className={`[&_svg]:block [&_svg]:h-auto [&_svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />

  return (
    <figure className="relative mx-auto w-[11.5rem] shrink-0 rounded-ui border border-rule bg-paper p-3 text-center sm:mx-0">
      <figcaption className="mb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-accent uppercase">Bangla QR</figcaption>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show the QR code larger"
        title="Show larger"
        className="absolute -top-3.5 -left-3.5 z-10 flex size-8 items-center justify-center rounded-full border border-rule bg-paper text-ink-soft shadow-sm hover:border-ink hover:text-ink"
      >
        <ExpandIcon />
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Show the QR code larger" className="block w-full cursor-zoom-in">
        {code('mx-auto w-full')}
      </button>
      <p className="mt-2 text-[0.8125rem] font-semibold tabular-nums">{number}</p>
      {qr.name ? <p className="text-[0.75rem] text-ink-soft">{qr.name}</p> : null}
      <a href={qr.png} download="afterword-bangla-qr.png" className="mt-2 inline-block text-[0.8125rem] font-medium underline underline-offset-2">
        Save QR to phone
      </a>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Bangla QR code"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-[2px]"
            >
              <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-[26rem] rounded-ui bg-paper p-6 text-center shadow-2xl sm:p-8">
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-ui text-ink-soft hover:bg-paper-deep hover:text-ink"
                >
                  <CloseIcon />
                </button>
                <p className="text-[0.75rem] font-semibold tracking-[0.16em] text-accent uppercase">Bangla QR</p>
                <p className="mt-1 text-[0.9375rem] text-ink-soft">Scan with bKash, Nagad, Rocket, Upay or your bank app</p>
                {code('mx-auto mt-5 w-full max-w-[20rem]')}
                <p className="mt-4 text-[1.125rem] font-semibold tabular-nums">{number}</p>
                {qr.name ? <p className="text-[0.875rem] text-ink-soft">{qr.name}</p> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </figure>
  )
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
  /** The shop's Bangla QR, drawn on the server, when one is set up. */
  bkashQr?: { svg: string; png: string; name: string | null } | null
  needsAdvanceBecause: string | null
  /** The books, for the order summary and for working out the parcels as choices change. */
  items: CheckoutItem[]
}> = ({ customer, rules, totals, plans, withPoints, points, methods, bkashNumber, bkashQr, needsAdvanceBecause, items }) => {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {})
  // Fields left empty: shown in red with a message, instead of the browser's own bubble.
  const [missing, setMissing] = useState<Record<string, string>>({})
  const firstMissing = React.useRef(false)
  const onInvalid = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = e.target as HTMLInputElement
    if (!el.name) return
    setMissing((m) => ({ ...m, [el.name]: CHECKOUT_MISSING[el.name] ?? 'Please fill this in.' }))
    if (!firstMissing.current) {
      firstMissing.current = true
      el.focus({ preventScroll: true })
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => (firstMissing.current = false), 0)
    }
  }
  // The server's answer the customer has started correcting, so its message can go.
  const [answered, setAnswered] = useState<CheckoutState | null>(null)
  const onFieldInput = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name
    if (name && missing[name]) setMissing(({ [name]: _, ...rest }) => rest)
    if (name === 'paymentSender') setAnswered(state)
  }
  // A problem the server found with the payer's number is shown at that field too.
  const serverSender = state.message && /paid from/.test(state.message) && answered !== state ? state.message : undefined
  const errorFor = (name: string) => missing[name] ?? (name === 'paymentSender' ? serverSender : undefined)
  React.useEffect(() => {
    if (!serverSender) return
    const el = document.getElementById('paymentSender')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }, [state, serverSender])
  const fieldClass = (name: string, extra = '') => `${field} ${extra} ${errorFor(name) ? fieldError : ''}`
  const describe = (name: string) => (errorFor(name) ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {})
  const [district, setDistrict] = useState(customer.district ?? 'Dhaka')
  const [usePoints, setUsePoints] = useState(false)
  const zone = district === 'Dhaka' ? 'inside_dhaka' : 'outside_dhaka'
  const spending = usePoints && points.usable > 0
  const one = spending ? withPoints.totals[zone] : totals[zone]
  const offered = (spending ? withPoints.plans : plans)[zone].filter((p) => p === 'cod' || methods.length > 0)
  const [plan, setPlan] = useState<PaymentPlan>(offered[0] ?? 'cod')
  const chosen = offered.includes(plan) ? plan : (offered[0] ?? 'cod')
  const [method, setMethod] = useState<PayMethod | undefined>(methods[0])
  const via = method && methods.includes(method) ? method : methods[0]
  const [delivery, setDelivery] = useState<DeliveryPlan>('split')
  const lines: PricedLine[] = items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, kind: i.kind }))
  const splittable = canSplit(lines)
  // The server prices one parcel; two parcels add a second delivery fee.
  const parcelsWanted = parcelCount(lines, delivery)
  const t = totalsForParcels(one, 1, parcelsWanted)
  const fee = one.delivery
  const parcels = planParcels(lines, t, chosen, delivery)
  const payNow = chosen === 'full' ? t.total : chosen === 'advance' ? t.advanceDue : 0
  const count = items.reduce((n, i) => n + i.quantity, 0)
  const days = zone === 'inside_dhaka' ? rules.insideDays : rules.outsideDays

  return (
    <form action={action} onInvalidCapture={onInvalid} onInputCapture={onFieldInput} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10">
      <div className="space-y-5">
        <Step title="Contact information" aside={<>Signed in as <strong className="font-semibold text-ink tabular-nums">{customer.phone.replace(/^\+88/, '')}</strong></>}>
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="name">
                Full name
              </label>
              <input id="name" name="name" autoComplete="name" required defaultValue={state.values?.name ?? customer.name ?? ''} className={fieldClass('name')} {...describe('name')} />
              <FieldError id="name-error" message={errorFor('name')} />
            </div>
            <div>
              <label className={label} htmlFor="email">
                Email <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? customer.email ?? ''} className={fieldClass('email')} {...describe('email')} />
              <FieldError id="email-error" message={errorFor('email')} />
            </div>
            <label className="flex items-start gap-2.5 text-[0.875rem] text-ink-soft">
              <input type="checkbox" name="newsletter" defaultChecked={state.values?.newsletter === 'on'} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
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
                defaultValue={state.values?.street ?? customer.street ?? ''}
                placeholder="e.g. House 12, Road 5, Dhanmondi, near the mosque"
                className={fieldClass('street', 'h-auto py-2.5')}
                {...describe('street')}
              />
              <FieldError id="street-error" message={errorFor('street')} />
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
              <strong className="font-medium tabular-nums">{fee === 0 ? 'Free' : parcelsWanted > 1 ? `${formatTaka(fee)} a parcel` : formatTaka(fee)}</strong>
            </div>
            <div>
              <label className={label} htmlFor="deliveryNote">
                Note for the courier <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="deliveryNote" name="deliveryNote" maxLength={160} defaultValue={state.values?.deliveryNote} placeholder="e.g. Call before coming" className={field} />
            </div>
          </div>
        </Step>

        {splittable ? (
          <Step title="Shipment" aside={fee === 0 ? 'Free delivery either way' : 'A delivery fee for each parcel'}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Choice
                name="deliveryPlan"
                value="split"
                checked={delivery === 'split'}
                onChange={() => setDelivery('split')}
                title="Two parcels"
                body="Books in stock come now; the books we order in follow when they arrive."
                side={fee === 0 ? 'Free' : formatTaka(fee * 2)}
              />
              <Choice
                name="deliveryPlan"
                value="together"
                checked={delivery === 'together'}
                onChange={() => setDelivery('together')}
                title="One parcel"
                body="Everything together, once all your books are here."
                side={fee === 0 ? 'Free' : formatTaka(fee)}
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
                    {m === 'bkash_manual' && bkashQr ? 'bKash or Bangla QR' : METHOD_LABEL[m]}
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
              <div className={bkashQr ? 'flex flex-col gap-5 sm:flex-row sm:items-start' : ''}>
                {bkashQr ? (
                  <QrCard qr={bkashQr} number={bkashNumber} />
                ) : null}
                <ol className="space-y-3 text-[0.9375rem]">
                  <li className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-paper">1</span>
                    <span>
                      Pay <strong className="tabular-nums">{formatTaka(payNow)}</strong>
                      {bkashQr ? (
                        <>
                          : scan the QR with bKash, Nagad, Rocket, Upay or your bank app, or use bKash <em className="font-medium not-italic">Send Money</em> to{' '}
                          <strong className="tabular-nums">{bkashNumber}</strong>.
                          {bkashQr.name ? <span className="mt-1 block text-[0.8125rem] text-ink-soft">Your app will show the name {bkashQr.name}.</span> : null}
                          <span className="mt-1 block text-[0.8125rem] text-ink-soft sm:hidden">On this phone? Save the QR, then choose “scan from gallery” in your app.</span>
                        </>
                      ) : (
                        <>
                          {' '}by bKash <em className="font-medium not-italic">Send Money</em> to <strong className="tabular-nums">{bkashNumber}</strong>.
                        </>
                      )}
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-paper">2</span>
                    <span>Tell us the number or account you paid from. We find your payment and confirm your order.</span>
                  </li>
                </ol>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="paymentSender">
                    {bkashQr ? 'Number or account you paid from' : 'bKash number you sent from'}
                  </label>
                  <input
                    id="paymentSender"
                    name="paymentSender"
                    type="text"
                    required
                    maxLength={30}
                    placeholder="e.g. 01712345678"
                    defaultValue={state.values?.paymentSender}
                    autoComplete="off"
                    className={fieldClass('paymentSender')}
                    {...describe('paymentSender')}
                  />
                  <FieldError id="paymentSender-error" message={errorFor('paymentSender')} />
                </div>
                <div>
                  <label className={label} htmlFor="paymentReference">
                    Transaction ID <span className="font-normal text-ink-soft">(optional)</span>
                  </label>
                  <input id="paymentReference" name="paymentReference" maxLength={40} defaultValue={state.values?.paymentReference} placeholder="e.g. 9A7B6C5D4E" className={`${field} uppercase placeholder:normal-case`} />
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
          <Row label={parcelsWanted > 1 && t.delivery > 0 ? 'Delivery fee (2 parcels)' : 'Delivery fee'} value={t.delivery === 0 ? 'Free' : formatTaka(t.delivery)} />
          <Row label="Total" value={formatTaka(t.total)} className="mt-1 border-t border-rule pt-3 font-display text-[1.375rem] font-medium" />
        </dl>

        {/* When the money is paid: now, and to the courier for each parcel. */}
        <dl className="mt-4 space-y-1.5 rounded-ui bg-paper-deep px-4 py-3 text-[0.875rem]">
          {payNow > 0 ? <Row label={`Pay now${via === 'sslcommerz' ? ' by card or wallet' : via === 'bkash' || (via === 'bkash_manual' && !bkashQr) ? ' by bKash' : ''}`} value={formatTaka(payNow)} className="font-semibold" /> : null}
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
          {Object.keys(missing).length ? (
            <p role="alert" className="text-center text-[0.875rem] font-medium text-[#b42318]">
              Please fill in the {Object.keys(missing).length === 1 ? 'field' : 'fields'} marked in red.
            </p>
          ) : null}
          <ErrorNote message={state.message && /paid from/.test(state.message) ? undefined : state.message} />
          <button type="submit" disabled={pending || offered.length === 0} className="btn btn-primary w-full">
            {pending ? 'Placing your order…' : 'Place order'}
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
