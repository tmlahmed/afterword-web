import type { Payload } from 'payload'

import type { Role } from '../access/roles'

export type AlertKind = 'order' | 'payment' | 'request' | 'review' | 'stock' | 'refund'

export type StaffAlert = {
  kind: AlertKind
  title: string
  detail?: string
  /** Where clicking the alert goes in the admin. */
  link?: string
  /** Which roles see it. Owners and managers see everything. */
  audience: Role[]
}

/**
 * Tell the staff something needs them: it appears under the bell at the top of the admin (and
 * as a desktop alert on computers that allowed them). Written just after the change that caused
 * it has been saved, so an order that fails to save never raises an alert, and a failed alert
 * never stops an order.
 */
export const alertStaff = (payload: Payload, alert: StaffAlert): void => {
  setTimeout(() => {
    payload
      .create({ collection: 'notifications', data: { ...alert, audience: alert.audience }, depth: 0, overrideAccess: true })
      .catch((err) => payload.logger.error(`Could not save a staff alert: ${err instanceof Error ? err.message : err}`))
  }, 300)
}
