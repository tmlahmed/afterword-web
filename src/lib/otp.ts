import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { sendSms, smsIsLive } from './notify'
import { normalisePhone } from './orders/pricing'

const CODE_MINUTES = 5
const MAX_ATTEMPTS = 5
const MAX_SENDS = 3 // per phone per ten minutes

const hash = (phone: string, code: string) =>
  createHmac('sha256', process.env.PAYLOAD_SECRET || 'dev-secret').update(`${phone}:${code}`).digest('hex')

export type OtpRequest = { ok: true; phone: string; devCode?: string } | { ok: false; message: string }

/** Send a six-digit sign-in code to a phone. */
export const requestOtp = async (payload: Payload, rawPhone: string): Promise<OtpRequest> => {
  const phone = normalisePhone(rawPhone)
  if (!phone) return { ok: false, message: 'Enter a Bangladeshi mobile number, for example 01712345678.' }

  const recent = await payload.count({
    collection: 'otp-codes',
    where: { and: [{ phone: { equals: phone } }, { createdAt: { greater_than: new Date(Date.now() - 10 * 60_000).toISOString() } }] },
    overrideAccess: true,
  })
  if (recent.totalDocs >= MAX_SENDS) return { ok: false, message: 'Too many codes requested. Please wait ten minutes and try again.' }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await payload.create({
    collection: 'otp-codes',
    data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), attempts: 0, used: false },
    overrideAccess: true,
    depth: 0,
  })
  await sendSms(payload, phone, `AFTERWORD: your sign-in code is ${code}. It lasts ${CODE_MINUTES} minutes. Never share it.`, 'otp')

  // Until an SMS provider is connected there is no way to receive the code, so on a
  // development machine it is shown on screen. This never happens in production.
  const showOnScreen = !smsIsLive() && process.env.NODE_ENV !== 'production'
  return { ok: true, phone, devCode: showOnScreen ? code : undefined }
}

export type OtpCheck = { ok: true; customerId: number } | { ok: false; message: string }

export const verifyOtp = async (payload: Payload, rawPhone: string, code: string): Promise<OtpCheck> => {
  const phone = normalisePhone(rawPhone)
  if (!phone || !/^\d{6}$/.test(code.trim())) return { ok: false, message: 'Enter the six-digit code.' }

  const found = await payload.find({
    collection: 'otp-codes',
    where: { and: [{ phone: { equals: phone } }, { used: { equals: false } }, { expiresAt: { greater_than: new Date().toISOString() } }] },
    sort: '-createdAt',
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  const entry = found.docs[0]
  if (!entry) return { ok: false, message: 'That code has expired. Ask for a new one.' }
  if ((entry.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, message: 'Too many wrong tries. Ask for a new code.' }

  const expected = Buffer.from(entry.codeHash)
  const given = Buffer.from(hash(phone, code.trim()))
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await payload.update({ collection: 'otp-codes', id: entry.id, data: { attempts: (entry.attempts ?? 0) + 1 }, overrideAccess: true, depth: 0 })
    return { ok: false, message: 'That code is not right. Check it and try again.' }
  }
  await payload.update({ collection: 'otp-codes', id: entry.id, data: { used: true }, overrideAccess: true, depth: 0 })

  const existing = await payload.find({ collection: 'customers', where: { phone: { equals: phone } }, limit: 1, overrideAccess: true, depth: 0 })
  if (existing.docs[0]?.blocked) return { ok: false, message: 'We cannot sign this number in. Please contact us.' }
  const customer = existing.docs[0] ?? (await payload.create({ collection: 'customers', data: { phone }, overrideAccess: true, depth: 0 }))
  return { ok: true, customerId: customer.id }
}
