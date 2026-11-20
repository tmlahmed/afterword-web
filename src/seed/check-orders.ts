/**
 * End-to-end check of the order rules against the local database:  pnpm check:orders
 * Places, confirms, ships, delivers and cancels test orders, then removes everything it created.
 * For development machines only — never run it against the live shop.
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { runOrderAction } from '../lib/orders/transitions'
import { dhakaDay, moneyReport, periodFrom, salesReport, stockReport, toCsv } from '../lib/reports'
import { shopRules } from '../lib/orders/prepare'
import { pointsEarned, pointsToSpend } from '../lib/orders/pricing'
import { getReviews, reviewEligibility } from '../lib/reviews'

const payload = await getPayload({ config })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
const stock = async (id: number) => (await payload.findByID({ collection: 'editions', id, depth: 0 })).stockOnHand ?? 0
const ledger = async (id: number) => (await payload.find({ collection: 'stock-movements', where: { edition: { equals: id } }, pagination: false, depth: 0 })).docs.reduce((s, m) => s + m.quantity, 0)
const base = { contactName: 'Test Customer', contactPhone: '01700000001', district: 'Dhaka' as const, area: 'Dhanmondi', street: 'House 1, Road 1', status: 'placed' as const, paymentStatus: 'unpaid' as const }
const place = (data: object, checkout = true) => payload.create({ collection: 'orders', data: { ...base, ...data } as never, overrideAccess: true, depth: 0, context: checkout ? { checkout: true } : {} })
const expectError = async (label: string, fn: () => Promise<unknown>, includes: string) => {
  try { await fn(); check(label, false, 'no error raised') } catch (e) { check(label, (e as Error).message.includes(includes), (e as Error).message) }
}

const inStock = (await payload.find({ collection: 'editions', where: { stockOnHand: { greater_than: 2 } }, limit: 1, depth: 0, sort: 'id' })).docs[0]
const onRequest = (await payload.find({ collection: 'editions', where: { and: [{ stockOnHand: { equals: 0 } }, { sourcing: { equals: 'standard' } }, { status: { equals: 'published' } }] }, limit: 1, depth: 0, sort: 'id' })).docs[0]
const before = await stock(inStock.id)
const created: number[] = []
// The checks follow whatever delivery and advance rules are set in Shop settings.
const rules = await payload.findGlobal({ slug: 'site-settings' })
const insideFee = rules.insideDhakaFee ?? 70
const freeAbove = rules.freeDeliveryAbove ?? 3000
const advanceShare = (rules.advancePercent ?? 50) / 100

// 1. Cash order from checkout
let o = await place({ lines: [{ edition: inStock.id, quantity: 2 }], paymentPlan: 'cod' })
created.push(o.id)
o = await payload.findByID({ collection: 'orders', id: o.id, depth: 0 })
check('order gets a number and token', /^AW-\d+$/.test(o.number ?? '') && (o.token ?? '').length === 36, o.number ?? '')
check('prices come from the catalogue', o.subtotal === inStock.price! * 2 && o.total === o.subtotal! + (o.subtotal! >= freeAbove ? 0 : insideFee) && o.payOnDelivery === o.total, `total ${o.total}`)
check('copies are set aside', (await stock(inStock.id)) === before - 2 && (await ledger(inStock.id)) === before - 2)
check('website order waits to be confirmed', o.status === 'placed')

// 2. Cannot oversell
await expectError('cannot order more copies than exist', () => place({ lines: [{ edition: inStock.id, quantity: before + 5 }], paymentPlan: 'cod' }), 'left')
check('failed order leaves stock untouched', (await stock(inStock.id)) === before - 2)

// 3. Two customers race for the remaining copies
const remaining = await stock(inStock.id)
const race = await Promise.allSettled([place({ lines: [{ edition: inStock.id, quantity: remaining }], paymentPlan: 'cod' }), place({ lines: [{ edition: inStock.id, quantity: remaining }], paymentPlan: 'cod', contactPhone: '01700000002' })])
const won = race.filter((r) => r.status === 'fulfilled')
won.forEach((r) => created.push((r as PromiseFulfilledResult<{ id: number }>).value.id))
check('only one of two simultaneous orders gets the last copies', won.length === 1 && (await stock(inStock.id)) === 0, `${won.length} succeeded, stock ${await stock(inStock.id)}`)

// 4. Confirm, ship, deliver
await expectError('cannot ship before confirming', () => runOrderAction(payload, o.id, { action: 'ship', courier: 'Pathao', trackingId: 'T1' }, 'Test'), 'Confirm the order')
o = await runOrderAction(payload, o.id, { action: 'confirm' }, 'Test')
check('confirm moves a stocked order to packing', o.status === 'packing')
o = await runOrderAction(payload, o.id, { action: 'ship', courier: 'Pathao', trackingId: 'TEST123' }, 'Test')
await expectError('cannot cancel once with the courier', () => runOrderAction(payload, o.id, { action: 'cancel' }, 'Test'), 'courier')
o = await runOrderAction(payload, o.id, { action: 'deliver' }, 'Test')
check('delivery records the cash collected', o.status === 'delivered' && o.paid === o.total && o.paymentStatus === 'paid' && o.payOnDelivery === 0)

// 5. Cancelling gives copies back
const raceWinner = (won[0] as PromiseFulfilledResult<{ id: number }>).value.id
await runOrderAction(payload, raceWinner, { action: 'cancel', reason: 'test' }, 'Test')
await wait(1200)
check('cancelling returns copies to stock', (await stock(inStock.id)) === remaining && (await ledger(inStock.id)) === remaining)

// 6. On Request needs an advance
await expectError('On Request cannot be cash on delivery at checkout', () => place({ lines: [{ edition: onRequest.id, quantity: 1 }], paymentPlan: 'cod' }), 'advance')
let r = await place({ lines: [{ edition: onRequest.id, quantity: 1 }], paymentPlan: 'advance', payNowVia: 'bkash_manual', paymentReference: 'TESTTRX1', paymentSender: '01700000001' })
created.push(r.id)
r = await payload.findByID({ collection: 'orders', id: r.id, depth: 0 })
const half = Math.ceil((onRequest.price! * advanceShare) / 10) * 10
check(`advance is ${rules.advancePercent ?? 50}% of the book, rounded up`, r.payNow === half && r.payOnDelivery === r.total! - half && r.paymentStatus === 'to_verify', `payNow ${r.payNow}`)
await expectError('cannot confirm before the advance is recorded', () => runOrderAction(payload, r.id, { action: 'confirm' }, 'Test'), 'advance')
await expectError('cannot record more than is owed', () => runOrderAction(payload, r.id, { action: 'record_payment', amount: r.total! + 1, method: 'bKash' }, 'Test'), 'more than')
r = await runOrderAction(payload, r.id, { action: 'record_payment', amount: half, method: 'bKash', reference: 'TESTTRX1' }, 'Test')
check('recording the advance confirms the order and waits for stock', r.status === 'awaiting_stock' && r.paymentStatus === 'advance_paid')

// 7. Stock arrives -> order released
const supplier = (await payload.find({ collection: 'suppliers', limit: 1 })).docs[0] ?? (await payload.create({ collection: 'suppliers', data: { name: 'Test supplier' } }))
await payload.create({ collection: 'stock-movements', data: { edition: onRequest.id, quantity: 3, reason: 'received', note: 'orders check' }, overrideAccess: true })
await wait(2500)
r = await payload.findByID({ collection: 'orders', id: r.id, depth: 0 })
check('arriving stock releases the waiting order', r.status === 'packing' && r.lines![0].allocated === true && (await stock(onRequest.id)) === 2, `status ${r.status}, stock ${await stock(onRequest.id)}`)

// 8. Staff phone order, promotion, free delivery outside Dhaka
await payload.delete({ collection: 'promotions', where: { code: { equals: 'TESTTEN' } }, overrideAccess: true })
await payload.create({ collection: 'promotions', data: { code: 'testten', type: 'percent', value: 10, active: true }, overrideAccess: true })
let s = await place({ lines: [{ edition: onRequest.id, quantity: 1 }], paymentPlan: 'cod', district: 'Sylhet', promoCode: 'TESTTEN', channel: 'phone' }, false)
created.push(s.id)
s = await payload.findByID({ collection: 'orders', id: s.id, depth: 0 })
check('staff order: 10% off, outside-Dhaka fee, confirmed at once', s.discount === Math.floor(onRequest.price! * 0.1) && s.delivery === 130 && s.status === 'packing' && s.zone === 'outside_dhaka', `discount ${s.discount}, delivery ${s.delivery}, status ${s.status}`)

// 9. Messages were logged
await wait(800)
const msgs = await payload.count({ collection: 'messages', where: { order: { in: created } }, overrideAccess: true })
check('customer messages are logged', msgs.totalDocs >= 6, `${msgs.totalDocs} messages`)

// 11. Reward points and reviews
{
  const { rewards } = await shopRules({ payload })
  const cust = (await payload.find({ collection: 'customers', where: { phone: { equals: '+8801700000001' } }, limit: 1, depth: 0 })).docs[0]
  const points = async () => (await payload.findByID({ collection: 'customers', id: cust.id, depth: 0 })).rewardPoints ?? 0
  const pointsLedger = async () => (await payload.find({ collection: 'reward-entries', where: { customer: { equals: cust.id } }, pagination: false, depth: 0 })).docs.reduce((t, e) => t + e.points, 0)
  const delivered = await payload.findByID({ collection: 'orders', id: o.id, depth: 0 })
  const expectedEarn = pointsEarned({ subtotal: delivered.subtotal ?? 0, discount: delivered.discount ?? 0, rewards: delivered.rewardDiscount ?? 0 }, rewards)
  check('delivery earns reward points', delivered.pointsEarned === expectedEarn && (await points()) === expectedEarn, `${delivered.pointsEarned} earned, balance ${await points()}`)

  await payload.create({ collection: 'reward-entries', data: { customer: cust.id, points: 500, reason: 'adjustment', note: 'orders check' }, overrideAccess: true })
  await wait(300)
  const balance = await points()
  check('staff can give points, and the balance follows the ledger', balance === expectedEarn + 500 && (await pointsLedger()) === balance, `balance ${balance}`)

  if (rewards.enabled) {
    const spend = pointsToSpend(balance, onRequest.price!, rewards)
    const pay = { lines: [{ edition: onRequest.id, quantity: 1 }], paymentPlan: 'full', payNowVia: 'bkash_manual', paymentReference: 'TESTPTS', paymentSender: '01700000001', usePoints: true }
    const pointsRace = await Promise.allSettled([place(pay), place(pay)])
    const spent = pointsRace.filter((x): x is PromiseFulfilledResult<Awaited<ReturnType<typeof place>>> => x.status === 'fulfilled').map((x) => x.value)
    spent.forEach((x) => created.push(x.id))
    const withPoints = spent.filter((x) => (x.pointsUsed ?? 0) > 0)
    check('the same points cannot be spent twice at once', withPoints.length === 1, `${withPoints.length} orders used points, ${spent.length} placed`)
    const p1 = withPoints[0] ? await payload.findByID({ collection: 'orders', id: withPoints[0].id, depth: 0 }) : null
    check('points come off the books, not delivery', Boolean(p1) && p1!.rewardDiscount === spend && p1!.total === onRequest.price! - spend + (p1!.delivery ?? 0), `used ${p1?.rewardDiscount}, expected ${spend}`)
    check('spending points lowers the balance', (await points()) === balance - spend && (await pointsLedger()) === balance - spend, `balance ${await points()}`)
    if (p1) await runOrderAction(payload, p1.id, { action: 'cancel', reason: 'points test' }, 'Test')
    await wait(300)
    check('cancelling gives the points back', (await points()) === balance, `balance ${await points()}`)
  }

  const eligible = await reviewEligibility(payload, cust, inStock.id)
  check('a customer whose order was delivered may review the book', eligible.canReview)
  const stranger = await reviewEligibility(payload, cust, onRequest.id)
  check('a book not yet delivered cannot be reviewed', !stranger.canReview)
  const review = await payload.create({
    collection: 'reviews',
    data: { edition: inStock.id, customer: cust.id, order: o.id, rating: 4, title: 'Test review', body: 'A test review written by the order check.', displayName: 'Test C.', status: 'pending' },
    overrideAccess: true,
  })
  check('a review is not shown until it is published', (await getReviews(payload, inStock.id)).every((r) => r.id !== review.id))
  await payload.update({ collection: 'reviews', id: review.id, data: { status: 'published' }, overrideAccess: true })
  await wait(1200)
  const rated = await payload.findByID({ collection: 'editions', id: inStock.id, depth: 0 })
  check('publishing a review updates the book’s rating', (rated.ratingCount ?? 0) >= 1 && (await getReviews(payload, inStock.id)).some((r) => r.id === review.id), `count ${rated.ratingCount}, average ${rated.ratingAverage}`)
  const publicView = (await getReviews(payload, inStock.id)).find((r) => r.id === review.id) as Record<string, unknown> | undefined
  check('the public never sees who wrote a review or their order', publicView !== undefined && publicView.customer === undefined && publicView.order === undefined)
  check('one review per customer per book', !(await reviewEligibility(payload, cust, inStock.id)).canReview)
}

// 12. Books in stock now, the rest when they arrive: two parcels, a delivery fee each
const mixedIds: number[] = []
const mixedBefore = new Map<number, number>()
{
  const mixedStock = (await payload.find({ collection: 'editions', where: { and: [{ stockOnHand: { greater_than: 1 } }, { id: { not_equals: inStock.id } }, { status: { equals: 'published' } }, { sourcing: { equals: 'standard' } }] }, limit: 1, depth: 0, sort: 'id' })).docs[0]
  const mixedLater = (await payload.find({ collection: 'editions', where: { and: [{ stockOnHand: { equals: 0 } }, { id: { not_equals: onRequest.id } }, { status: { equals: 'published' } }, { sourcing: { equals: 'standard' } }] }, limit: 1, depth: 0, sort: 'id' })).docs[0]
  for (const b of [mixedStock, mixedLater]) {
    mixedIds.push(b.id)
    mixedBefore.set(b.id, await stock(b.id))
  }
  const books = [{ edition: mixedStock.id, quantity: 1 }, { edition: mixedLater.id, quantity: 1 }]
  await expectError('a bKash advance needs the number it was sent from', () => place({ lines: books, paymentPlan: 'advance', payNowVia: 'bkash_manual', paymentReference: 'TESTMIX' }), 'you paid from')
  // The transaction ID is optional: a bank app may not show one.
  let m = await place({ lines: books, paymentPlan: 'advance', payNowVia: 'bkash_manual', paymentSender: '018 1111 1111', deliveryPlan: 'split' })
  created.push(m.id)
  m = await payload.findByID({ collection: 'orders', id: m.id, depth: 0 })
  const adv = Math.ceil((mixedLater.price! * advanceShare) / 10) * 10
  check('the advance is only on the book ordered in', m.payNow === adv, `advance ${m.payNow}, expected ${adv}`)
  check('the bKash number it was sent from is kept', m.paymentSender === '+8801811111111', String(m.paymentSender))
  check('without a transaction ID the payment still waits to be checked', m.paymentStatus === 'to_verify', String(m.paymentStatus))
  const p = m.parcels ?? []
  check('two parcels: the book in stock now, the other later', p.length === 2 && m.lines![0].parcel === 0 && m.lines![1].parcel === 1)
  const { rules: shop } = await shopRules({ payload })
  const fee = shop.freeDeliveryAbove > 0 && mixedStock.price! + mixedLater.price! >= shop.freeDeliveryAbove ? 0 : shop.insideDhakaFee
  check('two parcels cost two delivery fees (or none with free delivery)', m.delivery === fee * 2, `delivery ${m.delivery}, fee ${fee}`)
  check('the in-stock parcel is full cash on delivery with its delivery fee', p[0]?.collect === mixedStock.price! + fee, `collect ${p[0]?.collect}`)
  check('the later parcel collects the rest of its book and its own delivery fee', p[1]?.collect === mixedLater.price! - adv + fee, `collect ${p[1]?.collect}`)

  m = await runOrderAction(payload, m.id, { action: 'record_payment', amount: adv, method: 'bKash', reference: 'TESTMIX' }, 'Test')
  check('paying the advance readies the in-stock parcel; the rest waits', m.status === 'packing' && m.parcels?.[0].status === 'packing' && m.parcels?.[1].status === 'pending', `${m.status} ${m.parcels?.map((x) => x.status)}`)
  await expectError('the waiting parcel cannot be sent yet', () => runOrderAction(payload, m.id, { action: 'ship', parcel: 1, courier: 'Pathao', trackingId: 'TESTP2' }, 'Test'), 'cannot')
  m = await runOrderAction(payload, m.id, { action: 'ship', parcel: 0, courier: 'Pathao', trackingId: 'TESTP1' }, 'Test')
  m = await runOrderAction(payload, m.id, { action: 'deliver', parcel: 0 }, 'Test')
  check('after the first parcel, the order waits for the rest', m.status === 'awaiting_stock' && m.paid === adv + p[0].collect! && m.payOnDelivery === p[1].collect, `${m.status}, paid ${m.paid}`)

  await payload.create({ collection: 'stock-movements', data: { edition: mixedLater.id, quantity: 1, reason: 'received', note: 'orders check: arrival' }, overrideAccess: true })
  await wait(1500)
  m = await payload.findByID({ collection: 'orders', id: m.id, depth: 0 })
  check('when the book arrives, the second parcel is ready to pack', m.status === 'packing' && m.parcels?.[1].status === 'packing', `${m.status} ${m.parcels?.map((x) => x.status)}`)
  m = await runOrderAction(payload, m.id, { action: 'ship', parcel: 1, courier: 'Pathao', trackingId: 'TESTP2' }, 'Test')
  m = await runOrderAction(payload, m.id, { action: 'deliver', parcel: 1 }, 'Test')
  check('both parcels delivered, paid in full, two delivery fees', m.status === 'delivered' && m.paid === m.total && m.paymentStatus === 'paid' && m.total === mixedStock.price! + mixedLater.price! + (m.delivery ?? 0), `paid ${m.paid} of ${m.total}`)
}

// 10. Reports agree with the orders
{
  const period = periodFrom('7d')
  const sales = await salesReport(payload, period)
  const recent = await payload.find({ collection: 'orders', where: { createdAt: { greater_than_equal: period.from.toISOString() } }, depth: 0, pagination: false, overrideAccess: true })
  const counted = recent.docs.filter((x) => x.status !== 'cancelled' && x.status !== 'returned')
  const expected = counted.reduce((sum, x) => sum + (x.total ?? 0), 0)
  check('sales report totals match the orders', sales.totals.orders === counted.length && sales.totals.revenue === expected, `${sales.totals.orders} orders, ৳${sales.totals.revenue} vs ৳${expected}`)
  check('best sellers list the books sold', sales.bestSellers.some((b) => b.id === inStock.id || b.id === onRequest.id))
  const today = sales.days.at(-1)
  check('today appears in the day-by-day figures', today?.day === dhakaDay(new Date()) && today.orders > 0, today?.day ?? 'none')
  const stockNow = await stockReport(payload)
  const withCopies = await payload.count({ collection: 'editions', where: { stockOnHand: { greater_than: 0 } }, overrideAccess: true })
  check('stock report covers every book with copies', stockNow.titles === withCopies.totalDocs, `${stockNow.titles} vs ${withCopies.totalDocs}`)
  const money = await moneyReport(payload)
  check('money report sees the advance waiting to be checked or held', money.toVerify.length + money.advancesHeld.length > 0)
  const csv = toCsv(['a', 'b'], [['=1+1', 'x, "y"']])
  check('report downloads are safe to open in a spreadsheet', csv.includes("'=1+1") && csv.includes('"x, ""y"""'))
}

// --- clean up: everything this check created -------------------------------
for (const id of created) {
  const ord = await payload.findByID({ collection: 'orders', id, depth: 0 })
  if (['placed', 'awaiting_stock', 'packing'].includes(ord.status)) await runOrderAction(payload, id, { action: 'cancel', reason: 'test clean-up' }, 'Test')
}
await wait(1500)
const numbers = (await payload.find({ collection: 'orders', where: { id: { in: created } }, depth: 0, pagination: false })).docs.map((x) => x.number)
// the delivered test order: put its two copies back
await payload.create({ collection: 'stock-movements', data: { edition: inStock.id, quantity: 2, reason: 'adjustment', note: 'orders check: restore' }, overrideAccess: true })
await payload.create({ collection: 'stock-movements', data: { edition: onRequest.id, quantity: -(await stock(onRequest.id)), reason: 'adjustment', note: 'orders check: restore' }, overrideAccess: true }).catch(() => undefined)
await wait(1500)
await payload.delete({ collection: 'messages', where: { order: { in: created } }, overrideAccess: true })
await payload.delete({ collection: 'orders', where: { id: { in: created } }, overrideAccess: true })
await payload.delete({ collection: 'stock-movements', where: { or: [{ note: { like: 'orders check' } }, ...numbers.map((n) => ({ note: { like: n! } }))] }, overrideAccess: true })
await payload.delete({ collection: 'promotions', where: { code: { equals: 'TESTTEN' } }, overrideAccess: true })
const testCustomers = (await payload.find({ collection: 'customers', where: { phone: { in: ['+8801700000001', '+8801700000002'] } }, depth: 0, pagination: false })).docs.map((c) => c.id)
const reviewedBooks = (await payload.find({ collection: 'reviews', where: { customer: { in: testCustomers } }, depth: 0, pagination: false })).docs.map((r) => r.edition)
await payload.delete({ collection: 'reviews', where: { customer: { in: testCustomers } }, overrideAccess: true })
await payload.delete({ collection: 'reward-entries', where: { customer: { in: testCustomers } }, overrideAccess: true })
await payload.delete({ collection: 'customers', where: { phone: { in: ['+8801700000001', '+8801700000002'] } }, overrideAccess: true })
await wait(800) // ratings are recalculated just after a review is removed
check('clean-up removed the test reviews', reviewedBooks.length === 0 || ((await payload.findByID({ collection: 'editions', id: inStock.id, depth: 0 })).ratingCount ?? 0) === 0)
if (supplier.name === 'Test supplier') await payload.delete({ collection: 'suppliers', id: supplier.id, overrideAccess: true })
// ledger rows were removed directly, so restore the two stock figures to what the ledger says
for (const id of [inStock.id, onRequest.id, ...mixedIds]) await payload.update({ collection: 'editions', id, data: { stockOnHand: await ledger(id) }, depth: 0 })
check('clean-up restored stock', (await stock(inStock.id)) === before && (await stock(onRequest.id)) === 0, `${await stock(inStock.id)} vs ${before}`)
for (const id of mixedIds) check(`clean-up restored stock of book ${id}`, (await stock(id)) === mixedBefore.get(id), `${await stock(id)} vs ${mixedBefore.get(id)}`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(0)
