import type { Payload } from 'payload'

import type { Order } from '../payload-types'

/**
 * Text messages to customers.
 *
 * No SMS provider is connected yet, so messages are written to "Messages sent" in the admin
 * and to the server log instead of being delivered. To connect a provider, implement
 * `SmsProvider` and return it from `provider()`; nothing else needs to change.
 */
export type SmsProvider = { name: string; send: (to: string, body: string) => Promise<void> }

const provider = (): SmsProvider | null => null

export const smsIsLive = (): boolean => provider() !== null

export const sendSms = async (payload: Payload, to: string, body: string, kind: string, orderId?: number): Promise<void> => {
  const live = provider()
  let status: 'sent' | 'logged' | 'failed' = 'logged'
  if (live) {
    try {
      await live.send(to, body)
      status = 'sent'
    } catch (err) {
      status = 'failed'
      payload.logger.error(`SMS to ${to} failed: ${err instanceof Error ? err.message : err}`)
    }
  } else if (kind !== 'otp') {
    payload.logger.info(`[SMS not sent — no provider] to ${to}: ${body}`)
  }
  try {
    await payload.create({
      collection: 'messages',
      // One-time codes are never stored in readable form.
      data: { to, kind, body: kind === 'otp' ? 'Sign-in code (hidden)' : body, status, order: orderId },
      overrideAccess: true,
      depth: 0,
    })
  } catch {
    // The log is a convenience; never let it break an order.
  }
}

export type OrderEvent = 'placed' | 'confirmed' | 'shipped' | 'arrived' | 'delivered' | 'cancelled'

const TEMPLATE: Record<OrderEvent, 'smsPlaced' | 'smsConfirmed' | 'smsShipped' | 'smsArrived' | 'smsDelivered' | 'smsCancelled'> = {
  placed: 'smsPlaced',
  confirmed: 'smsConfirmed',
  shipped: 'smsShipped',
  arrived: 'smsArrived',
  delivered: 'smsDelivered',
  cancelled: 'smsCancelled',
}

export const siteUrl = (): string => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

/** Tell the customer about a change to their order. Runs after the change is saved; never throws. */
export const notifyOrder = (payload: Payload, order: Pick<Order, 'id' | 'number' | 'contactName' | 'contactPhone' | 'total' | 'token' | 'courier' | 'trackingId'>, event: OrderEvent): void => {
  setTimeout(async () => {
    try {
      const settings = await payload.findGlobal({ slug: 'site-settings' })
      const template = settings[TEMPLATE[event]]
      if (!template) return
      const body = template
        .replaceAll('{name}', (order.contactName ?? '').split(' ')[0] ?? '')
        .replaceAll('{number}', order.number ?? '')
        .replaceAll('{total}', String(order.total ?? ''))
        .replaceAll('{link}', `${siteUrl()}/order/${order.token}`)
        .replaceAll('{courier}', order.courier ?? '')
        .replaceAll('{tracking}', order.trackingId ?? '')
      await sendSms(payload, order.contactPhone, body, `order-${event}`, order.id)
    } catch (err) {
      payload.logger.error(`Order message failed: ${err instanceof Error ? err.message : err}`)
    }
  }, 300)
}
