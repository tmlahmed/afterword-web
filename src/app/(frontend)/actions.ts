'use server'

import config from '@payload-config'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { changeBag, emptyBag, getBag } from '../../lib/bag'
import { normalisePhone } from '../../lib/orders/pricing'
import { findPromotion } from '../../lib/orders/prepare'
import { requestOtp, verifyOtp } from '../../lib/otp'
import { type PayMethod, payMethods, payStartPath } from '../../lib/payments'
import { allowed } from '../../lib/rateLimit'
import { reviewEligibility, shortName } from '../../lib/reviews'
import { isEmail, subscribe } from '../../lib/newsletter'
import { endSession, ensureBagToken, getCustomer, readBagToken, startSession } from '../../lib/session'

const text = (form: FormData, key: string, max = 300) => String(form.get(key) ?? '').trim().slice(0, max)
const safeNext = (value: string) => (value.startsWith('/') && !value.startsWith('//') ? value : '/account')

// --- Bag ---------------------------------------------------------------------

const SLOW_DOWN = 'You have tried that many times in a short while. Please wait a little and try again.'

export type AddToBagState = { inBag?: number; message?: string; at?: number }

/** Add one copy and stay on the page. The header's bag count refreshes with the page. */
export async function addToBag(_prev: AddToBagState, form: FormData): Promise<AddToBagState> {
  const edition = Number(form.get('edition'))
  if (!Number.isInteger(edition) || edition <= 0) return { message: 'Something went wrong. Please reload the page.' }
  if (!(await allowed('bag'))) return { message: SLOW_DOWN }
  const token = await ensureBagToken()
  let inBag = 1
  await changeBag(token, (items) => {
    const existing = items.find((i) => i.edition === edition)
    inBag = existing ? Math.min(20, existing.quantity + 1) : 1
    return {
      items: existing ? items.map((i) => (i.edition === edition ? { ...i, quantity: inBag } : i)) : [...items, { edition, quantity: 1 }],
    }
  })
  revalidatePath('/', 'layout')
  return { inBag, at: Date.now() }
}

/** Set how many copies of a book are in the bag. 0 removes it; a book not in the bag is added back (undo). */
export async function setQuantity(form: FormData) {
  const edition = Number(form.get('edition'))
  const quantity = Math.max(0, Math.min(20, Math.floor(Number(form.get('quantity')) || 0)))
  if (!Number.isInteger(edition) || edition <= 0) return
  const token = quantity > 0 ? await ensureBagToken() : await readBagToken()
  if (!token) return
  await changeBag(token, (items) => {
    if (quantity === 0) return { items: items.filter((i) => i.edition !== edition) }
    if (!items.some((i) => i.edition === edition)) return { items: [...items, { edition, quantity }] }
    return { items: items.map((i) => (i.edition === edition ? { ...i, quantity } : i)) }
  })
  revalidatePath('/', 'layout')
}

export type PromoState = { message?: string; applied?: string; tried?: string }

/** Apply a promotion code to the bag, saying plainly when it does not work. */
export async function applyPromo(_prev: PromoState, form: FormData): Promise<PromoState> {
  const code = text(form, 'promoCode', 40).toUpperCase()
  if (!code) return { message: 'Enter a code.' }
  const token = await readBagToken()
  if (!token) return { message: 'Your bag is empty.' }
  const payload = await getPayload({ config })
  const promotion = await findPromotion({ payload }, code)
  if (!promotion) return { message: 'That code is not valid or has ended.', tried: code }
  await changeBag(token, (items) => ({ items, promoCode: promotion.code }))
  revalidatePath('/', 'layout')
  return { applied: promotion.code }
}

export async function removePromo() {
  const token = await readBagToken()
  if (!token) return
  await changeBag(token, (items) => ({ items, promoCode: null }))
  revalidatePath('/', 'layout')
}

/** Gift wrap and gift note, saved as the shopper changes them. */
export async function setGift(wrap: boolean, note: string) {
  const token = await readBagToken()
  if (!token) return
  await changeBag(token, (items) => ({ items, giftWrap: Boolean(wrap), giftNote: String(note ?? '').trim().slice(0, 240) }))
  revalidatePath('/', 'layout')
}

// --- Sign-in -----------------------------------------------------------------

export type SignInState = { step: 'phone' | 'code'; phone?: string; message?: string; devCode?: string }

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const payload = await getPayload({ config })
  const next = safeNext(text(form, 'next'))

  if (form.get('step') === 'code') {
    const phone = text(form, 'phone')
    if (!(await allowed('otpVerify'))) return { step: 'code', phone, message: SLOW_DOWN }
    const result = await verifyOtp(payload, phone, text(form, 'code', 6))
    if (!result.ok) return { step: 'code', phone, message: result.message, devCode: text(form, 'devCode', 6) || undefined }
    await startSession(result.customerId)
    revalidatePath('/', 'layout')
    redirect(next)
  }

  if (!(await allowed('otpRequest'))) return { step: 'phone', message: SLOW_DOWN }
  const result = await requestOtp(payload, text(form, 'phone', 20))
  if (!result.ok) return { step: 'phone', message: result.message }
  return { step: 'code', phone: result.phone, devCode: result.devCode }
}

export async function signOut() {
  await endSession()
  revalidatePath('/', 'layout')
  redirect('/')
}

// --- Checkout ----------------------------------------------------------------

/** `values`: what the customer typed, given back with an error so the form keeps it. */
export type CheckoutState = { message?: string; values?: Record<string, string> }

const CHECKOUT_FIELDS = ['name', 'email', 'street', 'deliveryNote', 'paymentSender', 'paymentReference', 'newsletter'] as const
const kept = (form: FormData): Record<string, string> => Object.fromEntries(CHECKOUT_FIELDS.map((f) => [f, String(form.get(f) ?? '').slice(0, 300)]))

export async function placeOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const customer = await getCustomer()
  if (!customer) redirect('/account/sign-in?next=/checkout')
  const bag = await getBag()
  if (bag.lines.length === 0) redirect('/bag')

  if (!(await allowed('order'))) return { message: SLOW_DOWN, values: kept(form) }
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'site-settings' })
  const plan = text(form, 'paymentPlan', 10) as 'cod' | 'advance' | 'full'
  const methods = payMethods(settings.bkashNumber)
  const asked = text(form, 'payNowVia', 20) as PayMethod
  const payNowVia = plan === 'cod' ? null : methods.includes(asked) ? asked : (methods[0] ?? null)
  if (plan !== 'cod' && !payNowVia) return { message: 'Online payment is not available yet. Please contact us to arrange the advance.', values: kept(form) }

  let token: string
  try {
    const order = await payload.create({
      collection: 'orders',
      data: {
        contactName: text(form, 'name', 80),
        contactPhone: customer!.phone,
        contactEmail: text(form, 'email', 120) || undefined,
        district: text(form, 'district', 40) as never,
        street: text(form, 'street', 300),
        deliveryNote: text(form, 'deliveryNote', 160) || undefined,
        lines: bag.lines.map((l) => ({ edition: l.edition.id, quantity: l.quantity })),
        giftWrap: bag.giftWrap,
        giftNote: bag.giftNote || undefined,
        promoCode: bag.promoCode ?? undefined,
        usePoints: form.get('usePoints') === 'on',
        paymentPlan: plan,
        payNowVia,
        paymentReference: payNowVia === 'bkash_manual' ? text(form, 'paymentReference', 40) : undefined,
        paymentSender: payNowVia === 'bkash_manual' ? text(form, 'paymentSender', 30) : undefined,
        deliveryPlan: text(form, 'deliveryPlan', 10) === 'together' ? 'together' : 'split',
        status: 'placed',
        paymentStatus: 'unpaid',
      },
      overrideAccess: true,
      depth: 0,
      context: { checkout: true },
    })
    token = order.token!
  } catch (err) {
    // Messages raised by the order rules are written for customers and safe to show.
    const message = err instanceof Error && (err as { isPublic?: boolean }).isPublic ? err.message : 'Sorry, the order could not be placed. Please try again.'
    if (!(err instanceof Error && (err as { isPublic?: boolean }).isPublic)) payload.logger.error(err)
    return { message, values: kept(form) }
  }

  const email = text(form, 'email', 254)
  if (form.get('newsletter') === 'on' && isEmail(email)) await subscribe(payload, email, 'checkout', text(form, 'name', 80)).catch(() => undefined)

  const bagToken = await readBagToken()
  if (bagToken) await emptyBag(bagToken)
  revalidatePath('/', 'layout')
  redirect(payStartPath(payNowVia, token) ?? `/order/${token}?placed=1`)
}

// --- On Request --------------------------------------------------------------

export type RequestState = { message?: string; done?: boolean }

export async function submitRequest(_prev: RequestState, form: FormData): Promise<RequestState> {
  const customer = await getCustomer()
  const wanted = text(form, 'wanted', 200)
  const phone = customer?.phone ?? normalisePhone(text(form, 'phone', 20))
  const name = text(form, 'name', 80) || customer?.name || ''
  if (wanted.length < 3) return { message: 'Tell us the title and author of the book.' }
  if (!name) return { message: 'Tell us your name.' }
  if (!phone) return { message: 'Enter a Bangladeshi mobile number, for example 01712345678.' }
  if (!(await allowed('request'))) return { message: SLOW_DOWN }

  const payload = await getPayload({ config })
  await payload.create({
    collection: 'requests',
    data: { wanted, isbn: text(form, 'isbn', 20) || undefined, note: text(form, 'note', 500) || undefined, contactName: name, contactPhone: phone, customer: customer?.id, status: 'new' },
    overrideAccess: true,
    depth: 0,
  })
  return { done: true }
}

// --- Reviews -------------------------------------------------------------------

export type ReviewState = { message?: string; done?: boolean }

export async function submitReview(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const customer = await getCustomer()
  if (!customer) return { message: 'Please sign in to review this book.' }
  const edition = Number(form.get('edition'))
  const rating = Number(form.get('rating'))
  const title = text(form, 'title', 90)
  const body = text(form, 'body', 2000)
  const displayName = text(form, 'displayName', 40) || shortName(customer.name)
  if (!Number.isInteger(edition) || edition <= 0) return { message: 'Something went wrong. Please reload the page.' }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { message: 'Choose a rating from one to five.' }
  if (title.length < 3) return { message: 'Give your review a short title.' }
  if (body.length < 20) return { message: 'Tell other readers a little more — a sentence or two at least.' }
  if (!(await allowed('request'))) return { message: SLOW_DOWN }

  const payload = await getPayload({ config })
  const eligible = await reviewEligibility(payload, customer, edition)
  if (!eligible.canReview) {
    return { message: eligible.reason === 'already' ? 'You have already reviewed this book. Thank you.' : 'Reviews are open to readers who bought the book from us.' }
  }
  await payload.create({
    collection: 'reviews',
    data: { edition, customer: customer.id, order: eligible.orderId, rating, title, body, displayName, status: 'pending' },
    overrideAccess: true,
    depth: 0,
  })
  return { done: true }
}

// --- Newsletter ----------------------------------------------------------------

export type NewsletterState = { message?: string; done?: boolean }

export async function joinNewsletter(_prev: NewsletterState, form: FormData): Promise<NewsletterState> {
  const email = text(form, 'email', 254)
  if (!isEmail(email)) return { message: 'Enter your email address, for example name@example.com.' }
  if (!(await allowed('request'))) return { message: SLOW_DOWN }
  await subscribe(await getPayload({ config }), email, 'form')
  return { done: true }
}
