#!/usr/bin/env node
/**
 * Access audit: asks the running shop for everything a stranger might try, with no sign-in,
 * and fails if anything private comes back. Run against a local copy, staging or the live site:
 *
 *   node scripts/check-access.mjs http://localhost:3000
 *
 * Read-only: it never changes anything (write attempts use data the server must refuse).
 */
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
let failures = 0
const report = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const get = async (path, init) => {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', ...init })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, headers: res.headers }
}

// Private collections: a stranger gets nothing.
const PRIVATE = [
  'orders', 'customers', 'otp-codes', 'carts', 'promotions', 'messages', 'requests',
  'stock-movements', 'purchase-orders', 'suppliers', 'users', 'catalogue-imports', 'search-misses',
  'reward-entries', 'subscribers',
]
for (const slug of PRIVATE) {
  const { status, body } = await get(`/api/${slug}?limit=5&depth=0`)
  const leaked = Array.isArray(body?.docs) && body.docs.length > 0
  report(!leaked && (status === 403 || status === 401 || (status === 200 && body?.totalDocs === 0)), `${slug} is private`, `HTTP ${status}${leaked ? `, ${body.docs.length} records returned` : ''}`)
}

// Public collections: only published records, and no cost or supplier fields.
const HIDDEN_BOOK_FIELDS = ['listPrice', 'listCurrency', 'priceOverride', 'supplier', 'importSource', 'coverSource', 'stockMovements']
{
  const { status, body } = await get('/api/editions?limit=50&depth=0')
  report(status === 200, 'books can be read', `HTTP ${status}`)
  const docs = body?.docs ?? []
  report(docs.every((d) => d.status === 'published'), 'only published books are visible', `${docs.filter((d) => d.status !== 'published').length} unpublished`)
  const exposed = HIDDEN_BOOK_FIELDS.filter((f) => docs.some((d) => d[f] !== undefined && d[f] !== null))
  report(exposed.length === 0, 'cost, supplier and source fields are hidden', exposed.join(', '))
  const drafts = await get('/api/editions?where[status][equals]=draft&limit=1')
  report((drafts.body?.docs ?? []).length === 0, 'asking for drafts returns none')
}
{
  const { body } = await get('/api/reviews?limit=50&depth=0')
  const docs = body?.docs ?? []
  report(docs.every((d) => d.status === 'published'), 'only published reviews are visible')
  report(docs.every((d) => d.customer === undefined && d.order === undefined), 'reviews never show who wrote them or their order')
}
await (async () => {
  const res = await fetch(`${base}/api/subscribers/export.csv`)
  report([401, 403].includes(res.status), 'the newsletter list cannot be downloaded', `HTTP ${res.status}`)
})()
for (const slug of ['articles', 'pages']) {
  const { body } = await get(`/api/${slug}?limit=50&depth=0`)
  report((body?.docs ?? []).every((d) => d.status === 'published'), `only published ${slug} are visible`)
}

// Settings: pricing rules are private; shop settings are public by design.
{
  const { status, body } = await get('/api/globals/pricing')
  report(status === 403 || !body?.rates?.length, 'pricing rules are private', `HTTP ${status}`)
}

// Things a stranger must not be able to do.
const refuse = async (label, path, init) => {
  const { status } = await get(path, init)
  report([401, 403, 404, 405].includes(status), label, `HTTP ${status}`)
}
const json = (data) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
await refuse('cannot create a staff account', '/api/users', json({ email: 'audit@example.invalid', password: 'x'.repeat(16), name: 'Audit' }))
await refuse('cannot create an order through the API', '/api/orders', json({ contactName: 'Audit' }))
await refuse('cannot add stock', '/api/stock-movements', json({ edition: 1, quantity: 100, reason: 'adjustment' }))
await refuse('cannot run order actions', '/api/orders/1/action', json({ action: 'cancel' }))
await refuse('cannot import books', '/api/editions/import-isbn', json({ isbn: '9780099448822' }))
await refuse('cannot start a catalogue import', '/api/catalogue-imports/start', json({ csv: 'isbn\n9780099448822' }))
await refuse('cannot download reports', '/api/reports/sales.csv')
await refuse('cannot change shop settings', '/api/globals/site-settings', json({ bkashNumber: '01000000000' }))
await refuse('cannot write a review through the API', '/api/reviews', json({ edition: 1, rating: 5, title: 'x', body: 'x', displayName: 'x' }))
await refuse('cannot give reward points', '/api/reward-entries', json({ customer: 1, points: 1000, reason: 'adjustment' }))
await refuse('cannot add newsletter subscribers through the API', '/api/subscribers', json({ email: 'audit@example.invalid' }))
await refuse('GraphQL is switched off', '/api/graphql', json({ query: '{ __typename }' }))
await refuse('packing slips are staff-only', '/desk/slip/1')

// Pages that need a sign-in send strangers to sign in rather than showing anything.
{
  const { status, headers } = await get('/account')
  report(status >= 300 && status < 400 && (headers.get('location') ?? '').includes('/account/sign-in'), 'account page asks for sign-in', `HTTP ${status}`)
  const order = await get('/order/not-a-real-token')
  report(order.status === 404, 'unknown order links show nothing', `HTTP ${order.status}`)
}

// Security headers (only sent by a production build).
{
  const res = await fetch(`${base}/`, { redirect: 'manual' })
  const production = res.headers.has('strict-transport-security') || !base.includes('localhost')
  if (production) {
    for (const h of ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'content-security-policy', 'x-frame-options']) {
      report(res.headers.has(h), `header ${h} is set`)
    }
  } else {
    console.log('SKIP  security headers (a development server does not send them; run against a production build)')
  }
  report(!res.headers.has('x-powered-by'), 'server does not announce its software')
}

console.log(failures ? `\n${failures} FAILED` : '\nAll access checks passed.')
process.exit(failures ? 1 : 0)
