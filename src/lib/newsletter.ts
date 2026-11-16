import 'server-only'

import type { Payload } from 'payload'

import { newSubscriberToken } from '../collections/growth'
import { siteUrl } from './notify'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isEmail = (value: string) => EMAIL.test(value) && value.length <= 254

/**
 * Add someone to the newsletter, or welcome them back. Always answers the same way, so the
 * form cannot be used to find out who is on the list.
 */
export const subscribe = async (payload: Payload, rawEmail: string, source: 'form' | 'checkout', name?: string): Promise<void> => {
  const email = rawEmail.trim().toLowerCase()
  if (!isEmail(email)) return
  const existing = (await payload.find({ collection: 'subscribers', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const now = new Date().toISOString()
  if (existing?.status === 'subscribed') return
  const token = existing?.token ?? newSubscriberToken()
  if (existing) {
    await payload.update({ collection: 'subscribers', id: existing.id, data: { status: 'subscribed', consentAt: now, unsubscribedAt: null, name: name || existing.name }, depth: 0, overrideAccess: true })
  } else {
    await payload.create({ collection: 'subscribers', data: { email, name, status: 'subscribed', source, consentAt: now, token }, depth: 0, overrideAccess: true })
  }
  // A short welcome, with the way out in it. Without email settings this goes to the server log.
  void payload
    .sendEmail({
      to: email,
      subject: 'Welcome to the AFTERWORD newsletter',
      text: [
        `Thank you for signing up${name ? `, ${name.split(' ')[0]}` : ''}.`,
        '',
        'About once a month we will write with new arrivals, booksellers’ picks and what we have been reading. Nothing more.',
        '',
        `If you did not ask for this, or change your mind, unsubscribe here: ${siteUrl()}/newsletter/unsubscribe?t=${token}`,
        '',
        'AFTERWORD',
      ].join('\n'),
    })
    .catch((err: unknown) => payload.logger.warn(`Welcome email not sent: ${err instanceof Error ? err.message : err}`))
}

export const unsubscribe = async (payload: Payload, token: string): Promise<boolean> => {
  if (!/^[a-f0-9]{36}$/.test(token)) return false
  const found = (await payload.find({ collection: 'subscribers', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!found) return false
  if (found.status !== 'unsubscribed') {
    await payload.update({ collection: 'subscribers', id: found.id, data: { status: 'unsubscribed', unsubscribedAt: new Date().toISOString() }, depth: 0, overrideAccess: true })
  }
  return true
}
