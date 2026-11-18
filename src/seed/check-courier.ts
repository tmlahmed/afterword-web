/**
 * End-to-end check of the Pathao integration against Pathao's TEST server:  pnpm check:courier
 * Books real test parcels (no rider comes on the test server), reads their status, and plays
 * through delivered, returned and cancelled pickups. Removes everything it created.
 * For development machines only, with the Pathao test-server settings in .env.
 */
import { getPayload } from 'payload'

import { bookWithPathao, checkPathaoParcel, syncPathao } from '../lib/courier'
import { pathaoMode } from '../lib/courier/pathao'
import { runOrderAction } from '../lib/orders/transitions'
import config from '../payload.config'

const payload = await getPayload({ config })
if (pathaoMode() !== 'test') {
  console.log(`Pathao must be on its test server for this check (it is "${pathaoMode()}").`)
  process.exit(1)
}
let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
const expectError = async (label: string, fn: () => Promise<unknown>, includes: string) => {
  try {
    await fn()
    check(label, false, 'no error raised')
  } catch (e) {
    check(label, (e as Error).message.includes(includes), (e as Error).message)
  }
}
const ledger = async (id: number) =>
  (await payload.find({ collection: 'stock-movements', where: { edition: { equals: id } }, pagination: false, depth: 0 })).docs.reduce((s, m) => s + m.quantity, 0)
const get = (id: number) => payload.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
const PHONE = '01700000003'

const book = (await payload.find({ collection: 'editions', where: { stockOnHand: { greater_than: 2 } }, limit: 1, depth: 0, sort: 'id' })).docs[0]
const before = book.stockOnHand ?? 0
const created: number[] = []
const place = async () => {
  const o = await payload.create({
    collection: 'orders',
    data: {
      contactName: 'Courier Test',
      contactPhone: PHONE,
      district: 'Dhaka',
      area: 'Dhanmondi',
      street: 'House 3, Road 14',
      deliveryNote: 'Call first',
      channel: 'phone',
      paymentPlan: 'cod',
      status: 'placed',
      paymentStatus: 'unpaid',
      lines: [{ edition: book.id, quantity: 1 }],
    } as never,
    overrideAccess: true,
    depth: 0,
  })
  created.push(o.id)
  return o
}

try {
  // 1. A phone order is confirmed and ready to pack; book it with Pathao.
  const a = await place()
  check('staff order is ready to pack', a.status === 'packing', a.status)
  const booked = await bookWithPathao(payload, a.id, 0, 'Test')
  const p = booked.parcels?.[0]
  check('booking hands the parcel to Pathao', booked.status === 'shipped' && p?.courier === 'Pathao', booked.status)
  check('Pathao gives a consignment ID as the tracking number', /^[A-Z0-9]{8,}$/.test(p?.trackingId ?? ''), p?.trackingId ?? '')
  check('Pathao’s status and charge are kept', Boolean(p?.courierStatus) && typeof p?.courierFee === 'number', `${p?.courierStatus}, ৳${p?.courierFee}`)
  check('the courier collects the whole cash-on-delivery amount', p?.collect === booked.total, `${p?.collect} of ${booked.total}`)
  await expectError('cannot book the same parcel twice', () => bookWithPathao(payload, a.id, 0, 'Test'), 'not ready to pack')

  // 2. Reading the real status from Pathao's test server.
  const said = await checkPathaoParcel(payload, a.id, 0, 'Test')
  check('reads the parcel’s status from Pathao', /Pending|Pickup/i.test(said), said)
  check('a parcel still on its way stays with the courier', (await get(a.id)).status === 'shipped')

  // 3. Pathao cancels the pickup: back to packing, then book again.
  await checkPathaoParcel(payload, a.id, 0, 'Test', { consignment_id: p!.trackingId!, order_status: 'Pickup Cancelled', order_status_slug: 'pickup_cancelled' })
  const back = await get(a.id)
  check('a cancelled pickup goes back to packing', back.status === 'packing' && !back.parcels?.[0]?.trackingId, back.status)
  const again = await bookWithPathao(payload, a.id, 0, 'Test')
  check('it can be booked again', again.status === 'shipped' && again.parcels?.[0]?.trackingId !== p?.trackingId)

  // 4. Delivered: the order finishes and the cash is recorded.
  await checkPathaoParcel(payload, a.id, 0, 'Test', { consignment_id: again.parcels![0].trackingId!, order_status: 'Delivered', order_status_slug: 'delivered' })
  const done = await get(a.id)
  check('Pathao “delivered” marks the order delivered', done.status === 'delivered', done.status)
  check('the cash the courier collected is recorded', done.paid === done.total && done.paymentStatus === 'paid', `${done.paid} of ${done.total}`)
  check('the history says Pathao did it', (done.timeline ?? []).some((t) => /Pathao says “Delivered”/.test(t.event)))

  // 5. Returned: books go back on the shelf.
  const b = await place()
  const bBooked = await bookWithPathao(payload, b.id, 0, 'Test')
  await checkPathaoParcel(payload, b.id, 0, 'Test', { consignment_id: bBooked.parcels![0].trackingId!, order_status: 'Return', order_status_slug: 'return' })
  const returned = await get(b.id)
  check('Pathao “return” marks the parcel returned', returned.status === 'returned', returned.status)
  check('the returned copy is back in stock', !returned.lines?.[0]?.allocated)

  // 6. Partly delivered: left for staff, with a note.
  const c = await place()
  const cBooked = await bookWithPathao(payload, c.id, 0, 'Test')
  await checkPathaoParcel(payload, c.id, 0, 'Test', { consignment_id: cBooked.parcels![0].trackingId!, order_status: 'Partial Delivery', order_status_slug: 'partial_delivery' })
  const partial = await get(c.id)
  check('a partial delivery is left for staff', partial.status === 'shipped' && (partial.timeline ?? []).some((t) => t.event.includes('finish this parcel by hand')))

  // 7. The half-hourly sync and the webhook look up one parcel or all.
  const one = await syncPathao(payload, cBooked.parcels![0].trackingId!)
  check('sync checks the one parcel the webhook names', one.checked === 1 && one.problems.length === 0, JSON.stringify(one))
  const all = await syncPathao(payload)
  check('sync checks every parcel with Pathao', all.checked >= 1 && all.problems.length === 0, JSON.stringify(all))

  // 8. Taking a parcel back by hand, then cancelling.
  await runOrderAction(payload, c.id, { action: 'unship', parcel: 0, reason: 'test' }, 'Test')
  check('staff can take a parcel back from the courier', (await get(c.id)).status === 'packing')
} catch (err) {
  check('the check ran to the end', false, err instanceof Error ? err.message : String(err))
}

// --- clean up ---------------------------------------------------------------
for (const id of created) {
  const o = await get(id)
  if (['placed', 'awaiting_stock', 'packing'].includes(o.status)) await runOrderAction(payload, id, { action: 'cancel', reason: 'test clean-up' }, 'Test')
}
await new Promise((r) => setTimeout(r, 1500))
const numbers = (await payload.find({ collection: 'orders', where: { id: { in: created } }, depth: 0, pagination: false })).docs.map((o) => o.number!)
await payload.delete({ collection: 'messages', where: { order: { in: created } }, overrideAccess: true })
await payload.delete({ collection: 'orders', where: { id: { in: created } }, overrideAccess: true })
if (numbers.length) await payload.delete({ collection: 'stock-movements', where: { or: numbers.map((n) => ({ note: { like: n } })) }, overrideAccess: true })
const testCustomers = (await payload.find({ collection: 'customers', where: { phone: { equals: `+88${PHONE}` } }, depth: 0, pagination: false })).docs.map((c) => c.id)
if (testCustomers.length) await payload.delete({ collection: 'reward-entries', where: { customer: { in: testCustomers } }, overrideAccess: true })
await payload.delete({ collection: 'customers', where: { phone: { equals: `+88${PHONE}` } }, overrideAccess: true })
await payload.update({ collection: 'editions', id: book.id, data: { stockOnHand: await ledger(book.id) }, depth: 0 })
const after = (await payload.findByID({ collection: 'editions', id: book.id, depth: 0 })).stockOnHand
check('clean-up restored stock', after === before, `${after} vs ${before}`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(0)
