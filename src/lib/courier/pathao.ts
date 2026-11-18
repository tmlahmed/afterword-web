import type { PathaoBooking, PathaoPlace } from './pathao-rules'

/**
 * Pathao Courier Merchant API (the "aladdin" API): sign in with OAuth password grant, book a
 * parcel, read a parcel's status, and list stores, cities and zones.
 *
 * Switches on when PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME and PATHAO_PASSWORD
 * are set. Uses Pathao's test server unless PATHAO_LIVE=true. PATHAO_STORE_ID picks the pickup
 * store; without it the default (or first active) store on the account is used.
 */
// The live address is not in Pathao's documentation page; PATHAO_BASE_URL overrides it if
// Pathao gives a different one with the live credentials.
const base = () =>
  (process.env.PATHAO_BASE_URL || (process.env.PATHAO_LIVE === 'true' ? 'https://api-hermes.pathao.com' : 'https://courier-api-sandbox.pathao.com')).replace(/\/$/, '')

export const pathaoMode = (): 'off' | 'test' | 'live' => {
  const on = Boolean(process.env.PATHAO_CLIENT_ID && process.env.PATHAO_CLIENT_SECRET && process.env.PATHAO_USERNAME && process.env.PATHAO_PASSWORD)
  if (!on) return 'off'
  return process.env.PATHAO_LIVE === 'true' ? 'live' : 'test'
}

export class PathaoError extends Error {}

// Pathao's token lasts for weeks. Keep it in memory, refresh it when it runs out, and sign in
// again if the refresh is refused. One server process, so memory is enough.
type Grant = { access: string; refresh?: string; expires: number }
type Memory = { grant?: Grant; places?: { at: number; cities?: PathaoPlace[]; zones: Map<number, PathaoPlace[]> }; storeId?: number }
const memory: Memory = ((globalThis as { __awPathao?: Memory }).__awPathao ??= {})

const issue = async (body: Record<string, string>): Promise<Grant> => {
  const res = await fetch(`${base()}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: process.env.PATHAO_CLIENT_ID, client_secret: process.env.PATHAO_CLIENT_SECRET, ...body }),
    signal: AbortSignal.timeout(45000),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string }
  if (!data.access_token) throw new PathaoError(`Pathao refused the sign-in: ${data.message ?? res.status}`)
  return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 }
}

const token = async (): Promise<string> => {
  const g = memory.grant
  if (g && g.expires > Date.now() + 5 * 60_000) return g.access
  if (g?.refresh) {
    try {
      memory.grant = await issue({ grant_type: 'refresh_token', refresh_token: g.refresh })
      return memory.grant.access
    } catch {
      // Fall through and sign in again.
    }
  }
  memory.grant = await issue({ grant_type: 'password', username: process.env.PATHAO_USERNAME ?? '', password: process.env.PATHAO_PASSWORD ?? '' })
  return memory.grant.access
}

type Reply<T> = { message?: string; type?: string; code?: number; data?: T; errors?: Record<string, string[]> }

const call = async <T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}, retried = false): Promise<T> => {
  if (pathaoMode() === 'off') throw new PathaoError('Pathao is not connected. Add the Pathao settings to the server first.')
  const res = await fetch(`${base()}/aladdin/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json', Authorization: `Bearer ${await token()}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(45000),
  })
  // A token Pathao has withdrawn: sign in again once.
  if (res.status === 401 && !retried) {
    memory.grant = undefined
    return call<T>(path, init, true)
  }
  const reply = (await res.json().catch(() => ({}))) as Reply<T>
  if (!res.ok || reply.type === 'error' || reply.data === undefined) {
    const detail = reply.errors ? Object.values(reply.errors).flat().join(' ') : ''
    throw new PathaoError(`Pathao: ${detail || reply.message || `error ${res.status}`}`)
  }
  return reply.data
}

type Store = { store_id: number | string; store_name?: string; is_active?: number; is_default_store?: boolean | number }

export const pathaoStores = async (): Promise<Store[]> => (await call<{ data: Store[] }>('/stores')).data ?? []

/** The pickup store: PATHAO_STORE_ID, or the account's default store, or its first active one. */
export const pathaoStoreId = async (): Promise<number> => {
  const fixed = Number(process.env.PATHAO_STORE_ID)
  if (fixed) return fixed
  if (memory.storeId) return memory.storeId
  const stores = (await pathaoStores()).filter((s) => Number(s.is_active ?? 1) === 1)
  const store = stores.find((s) => Boolean(s.is_default_store)) ?? stores[0]
  if (!store) throw new PathaoError('There is no active store on the Pathao account. Add one in the Pathao merchant panel.')
  memory.storeId = Number(store.store_id)
  return memory.storeId
}

// Cities and zones change rarely; keep them for a day.
const places = () => {
  if (!memory.places || memory.places.at < Date.now() - 24 * 3600_000) memory.places = { at: Date.now(), zones: new Map() }
  return memory.places
}

export const pathaoCities = async (): Promise<PathaoPlace[]> => {
  const p = places()
  p.cities ??= ((await call<{ data: { city_id: number; city_name: string }[] }>('/city-list')).data ?? []).map((c) => ({ id: c.city_id, name: c.city_name }))
  return p.cities
}

export const pathaoZones = async (cityId: number): Promise<PathaoPlace[]> => {
  const p = places()
  if (!p.zones.has(cityId)) {
    const data = (await call<{ data: { zone_id: number; zone_name: string }[] }>(`/cities/${cityId}/zone-list`)).data ?? []
    p.zones.set(cityId, data.map((z) => ({ id: z.zone_id, name: z.zone_name })))
  }
  return p.zones.get(cityId) ?? []
}

export type Consignment = { consignment_id: string; order_status?: string; order_status_slug?: string; delivery_fee?: number; updated_at?: string }

export const pathaoBook = (booking: PathaoBooking): Promise<Consignment> => call<Consignment>('/orders', { method: 'POST', body: booking })

export const pathaoInfo = (consignmentId: string): Promise<Consignment> => call<Consignment>(`/orders/${encodeURIComponent(consignmentId)}/info`)
