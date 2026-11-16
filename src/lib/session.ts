import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Customer } from '../payload-types'

/**
 * Customer sessions. A shopper proves their phone number with a one-time code and is then
 * remembered by a signed cookie. The cookie holds only their customer number and an expiry;
 * the signature stops it being altered.
 */
const SESSION = 'aw_session'
const BAG = 'aw_bag'
const SESSION_DAYS = 60

const secret = () => process.env.PAYLOAD_SECRET || 'dev-secret'
const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url')

const cookieOptions = (days: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: days * 86400,
})

export const startSession = async (customerId: number): Promise<void> => {
  const body = `${customerId}.${Date.now() + SESSION_DAYS * 86400_000}`
  ;(await cookies()).set(SESSION, `${body}.${sign(body)}`, cookieOptions(SESSION_DAYS))
}

export const endSession = async (): Promise<void> => {
  ;(await cookies()).delete(SESSION)
}

/** The signed-in customer, or null. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const raw = (await cookies()).get(SESSION)?.value
  if (!raw) return null
  const [id, expires, signature] = raw.split('.')
  if (!id || !expires || !signature) return null
  const expected = Buffer.from(sign(`${id}.${expires}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  if (Number(expires) < Date.now()) return null
  const payload = await getPayload({ config })
  const customer = await payload.findByID({ collection: 'customers', id: Number(id), depth: 0, overrideAccess: true, disableErrors: true })
  return customer && !customer.blocked ? customer : null
})

export const readBagToken = async (): Promise<string | null> => (await cookies()).get(BAG)?.value ?? null

/** The bag token for this browser, created on first use. Only callable from a server action. */
export const ensureBagToken = async (): Promise<string> => {
  const jar = await cookies()
  const existing = jar.get(BAG)?.value
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing
  const token = randomBytes(16).toString('hex')
  jar.set(BAG, token, cookieOptions(90))
  return token
}
