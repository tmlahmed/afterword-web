import { randomBytes } from 'node:crypto'

import { APIError, type PayloadRequest, type RequestContext } from 'payload'

import type { Order } from '../../payload-types'
import { notifyOrder } from '../notify'
import { type LineKind, normalisePhone, type PaymentPlan, plansFor, pointsToSpend, priceOrder, type Promotion, type RewardRules, splitPayment, zoneFor } from './pricing'
import { recordMovement, takeCopies, takePoints } from './stock'

const fail = (message: string): never => {
  throw new APIError(message, 400, undefined, true)
}

const idOf = (v: unknown): number => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number))

/** A promotion code that is switched on, in date and not used up — or null. */
export const findPromotion = async (req: Pick<PayloadRequest, 'payload'>, code?: string | null): Promise<Promotion | null> => {
  const wanted = code?.trim().toUpperCase()
  if (!wanted) return null
  const found = await req.payload.find({ collection: 'promotions', where: { code: { equals: wanted } }, limit: 1, depth: 0, overrideAccess: true })
  const promo = found.docs[0]
  const now = Date.now()
  if (!promo || !promo.active) return null
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return null
  if (promo.endsAt && new Date(promo.endsAt).getTime() < now) return null
  if (promo.usageLimit && (promo.used ?? 0) >= promo.usageLimit) return null
  return { code: promo.code, type: promo.type, value: promo.value ?? 0, minSubtotal: promo.minSubtotal }
}

export const shopRules = async (req: Pick<PayloadRequest, 'payload'>) => {
  const s = await req.payload.findGlobal({ slug: 'site-settings' })
  return {
    settings: s,
    rules: {
      insideDhakaFee: s.insideDhakaFee ?? 0,
      outsideDhakaFee: s.outsideDhakaFee ?? 0,
      freeDeliveryAbove: s.freeDeliveryAbove ?? 0,
      giftWrapFee: s.giftWrapFee ?? 0,
      advancePercent: s.advancePercent ?? 50,
      codCeiling: s.codCeiling ?? 0,
    },
    rewards: {
      enabled: s.rewardsEnabled !== false,
      earnPerHundred: s.rewardsEarnPerHundred ?? 1,
      redeemMinimum: s.rewardsRedeemMinimum ?? 100,
      redeemMaxPercent: s.rewardsRedeemMaxPercent ?? 20,
    } satisfies RewardRules,
  }
}

/**
 * Runs when an order is created, whether by checkout or by staff in the admin.
 * Only the customer, address, books and payment choice are taken from what was submitted;
 * every price and total is worked out here from the catalogue, and copies in stock are
 * set aside in the same transaction — if anything fails, nothing is saved.
 */
export const prepareOrder = async (data: Partial<Order>, req: PayloadRequest, context: RequestContext): Promise<Partial<Order>> => {
  const { payload } = req
  const fromCheckout = Boolean(context?.checkout)

  const phone = normalisePhone(String(data.contactPhone ?? '')) ?? fail('Enter a valid Bangladeshi mobile number, for example 01712345678.')
  if (!data.contactName?.trim()) fail('Enter the customer’s name.')
  if (!data.district || !data.area?.trim() || !data.street?.trim()) fail('Enter the full delivery address.')

  // Customer: matched by phone, created on first order.
  const existing = await payload.find({ collection: 'customers', where: { phone: { equals: phone } }, limit: 1, depth: 0, overrideAccess: true, req })
  const customer =
    existing.docs[0] ??
    (await payload.create({ collection: 'customers', data: { phone, name: data.contactName }, depth: 0, overrideAccess: true, req }))
  if (customer.blocked) fail('We cannot take this order. Please contact us.')

  // Books: merge repeated lines, then price and classify each from the catalogue.
  const wanted = new Map<number, number>()
  for (const line of data.lines ?? []) {
    const id = idOf(line.edition)
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
    if (id) wanted.set(id, (wanted.get(id) ?? 0) + qty)
  }
  if (wanted.size === 0) fail('Add at least one book.')

  const lines: NonNullable<Order['lines']> = []
  for (const [editionId, quantity] of wanted) {
    const book = await payload.findByID({ collection: 'editions', id: editionId, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!book || book.status !== 'published') fail('One of the books is no longer available.')
    if (book!.sourcing === 'out_of_print') fail(`“${book!.title}” is out of print and cannot be ordered.`)
    if (!book!.price || book!.price <= 0) fail(`“${book!.title}” has no price yet.`)

    let kind: LineKind = book!.sourcing === 'pre_order' ? 'pre_order' : 'on_request'
    let allocated = false
    const onHand = book!.stockOnHand ?? 0
    if (book!.sourcing === 'standard' && onHand > 0) {
      if (onHand < quantity || !(await takeCopies(payload, editionId, quantity, req))) {
        fail(`Only ${onHand} ${onHand === 1 ? 'copy' : 'copies'} of “${book!.title}” ${onHand === 1 ? 'is' : 'are'} left. Please reduce the quantity.`)
      }
      kind = 'in_stock'
      allocated = true
    }
    lines.push({ edition: editionId, quantity, title: book!.title, authorLine: book!.authorLine, isbn13: book!.isbn13, unitPrice: book!.price!, kind, allocated })
  }

  const { rules, rewards } = await shopRules(req)
  const promotion = await findPromotion(req, data.promoCode)
  if (data.promoCode?.trim() && !promotion && fromCheckout) fail('That promotion code is not valid.')
  const zone = zoneFor(data.district!)
  const priced = lines.map((l) => ({ unitPrice: l.unitPrice!, quantity: l.quantity, kind: l.kind as LineKind }))
  const beforePoints = priceOrder(priced, zone, rules, { giftWrap: Boolean(data.giftWrap), promotion })

  // Reward points: as many as the rules allow, taken off the balance in the same transaction.
  const pointsUsed = data.usePoints ? pointsToSpend(customer.rewardPoints ?? 0, beforePoints.subtotal - beforePoints.discount, rewards) : 0
  if (pointsUsed > 0 && !(await takePoints(payload, customer.id, pointsUsed, req))) fail('Your points balance has just changed. Please check your order and try again.')
  const totals = pointsUsed ? priceOrder(priced, zone, rules, { giftWrap: Boolean(data.giftWrap), promotion, rewardCredit: pointsUsed }) : beforePoints

  const plan = (data.paymentPlan ?? 'cod') as PaymentPlan
  // Customers must follow the advance rules. Staff may override them for a customer they know.
  if (fromCheckout && !plansFor(totals).includes(plan)) fail('This order needs an advance payment. Please choose bKash or card.')
  if (plan === 'advance' && totals.advanceDue === 0) fail('No advance is needed for this order. Choose cash on delivery or pay in full.')
  const { payNow, payOnDelivery } = splitPayment(totals, plan)
  if (payNow > 0 && !data.payNowVia) fail('Choose how the advance will be paid.')
  if (data.payNowVia === 'bkash_manual' && fromCheckout && !data.paymentReference?.trim()) fail('Enter the bKash transaction ID.')

  const now = new Date().toISOString()
  const staffName = !fromCheckout && req.user ? ((req.user as { name?: string }).name ?? 'Staff') : undefined
  const timeline: NonNullable<Order['timeline']> = [{ at: now, event: fromCheckout ? 'Order placed on the website' : 'Order entered by staff', by: staffName ?? 'Customer' }]

  // A cash order taken by staff has already been confirmed in conversation.
  let status: Order['status'] = 'placed'
  if (!fromCheckout && payNow === 0) {
    status = lines.every((l) => l.allocated) ? 'packing' : 'awaiting_stock'
    timeline.push({ at: now, event: 'Confirmed', by: staffName })
  }

  return {
    ...data,
    contactPhone: phone,
    contactName: data.contactName!.trim(),
    customer: customer.id,
    lines,
    zone,
    promoCode: promotion?.code ?? null,
    subtotal: totals.subtotal,
    discount: totals.discount,
    rewardDiscount: totals.rewards,
    pointsUsed: totals.rewards,
    pointsEarned: 0,
    delivery: totals.delivery,
    giftWrapFee: totals.giftWrap,
    total: totals.total,
    paymentPlan: plan,
    payNowVia: payNow > 0 ? data.payNowVia : null,
    payNow,
    payOnDelivery,
    paid: 0,
    payments: [],
    status,
    paymentStatus: payNow > 0 && data.payNowVia === 'bkash_manual' && data.paymentReference ? 'to_verify' : 'unpaid',
    channel: fromCheckout ? 'web' : (data.channel ?? 'phone'),
    token: randomBytes(18).toString('hex'),
    timeline,
    courier: null,
    trackingId: null,
  }
}

/** After the order row exists: give it a number, write the stock ledger, update the customer, send the message. */
export const afterOrderCreated = async (doc: Order, req: PayloadRequest, context: RequestContext): Promise<Order> => {
  if (context?.internal) return doc
  const { payload } = req
  const number = `AW-${100000 + doc.id}`

  for (const line of doc.lines ?? []) {
    if (line.allocated) await recordMovement(payload, idOf(line.edition), -line.quantity, 'sale', `Order ${number}`, req)
  }

  const customerId = idOf(doc.customer)
  if (customerId) {
    const customer = await payload.findByID({ collection: 'customers', id: customerId, depth: 0, overrideAccess: true, req })
    await payload.update({
      collection: 'customers',
      id: customerId,
      data: {
        name: doc.contactName,
        email: doc.contactEmail ?? customer.email,
        address: { district: doc.district, area: doc.area, street: doc.street },
        ordersCount: (customer.ordersCount ?? 0) + 1,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }

  if ((doc.pointsUsed ?? 0) > 0 && customerId) {
    await payload.create({
      collection: 'reward-entries',
      data: { customer: customerId, points: -(doc.pointsUsed ?? 0), reason: 'spent', order: doc.id, note: `Order ${number}` },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }

  if (doc.promoCode) {
    const promo = await payload.find({ collection: 'promotions', where: { code: { equals: doc.promoCode } }, limit: 1, depth: 0, overrideAccess: true, req })
    if (promo.docs[0]) {
      await payload.update({ collection: 'promotions', id: promo.docs[0].id, data: { used: (promo.docs[0].used ?? 0) + 1 }, depth: 0, overrideAccess: true, req })
    }
  }

  await payload.update({ collection: 'orders', id: doc.id, data: { number }, depth: 0, overrideAccess: true, req, context: { internal: true } })
  notifyOrder(payload, { ...doc, number }, 'placed')
  return { ...doc, number }
}
