import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

/** The database handle for this request's transaction, so stock changes commit or roll back with the order. */
export const dbFor = async (payload: Payload, req?: Partial<PayloadRequest>) => {
  const id = req?.transactionID ? await req.transactionID : undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = payload.db as any
  return (id && adapter.sessions?.[id]?.db) || adapter.drizzle
}

/**
 * Take copies off the shelf for an order — but only if that many are really there.
 * This is one database statement, so two customers can never both get the last copy.
 * Returns false when there are not enough copies.
 */
export const takeCopies = async (payload: Payload, editionId: number, quantity: number, req?: Partial<PayloadRequest>): Promise<boolean> => {
  const db = await dbFor(payload, req)
  const result = await db.execute(
    sql`UPDATE editions SET stock_on_hand = stock_on_hand - ${quantity} WHERE id = ${editionId} AND stock_on_hand >= ${quantity} RETURNING id`,
  )
  return (result.rows ?? result).length > 0
}

/** Write the ledger entry that matches copies taken or given back. */
export const recordMovement = async (
  payload: Payload,
  editionId: number,
  quantity: number,
  reason: 'sale' | 'released' | 'return',
  note: string,
  req?: Partial<PayloadRequest>,
  /** The order the copies go to or come back from, so they return to the lots they came from. */
  orderId?: number,
): Promise<void> => {
  await payload.create({
    collection: 'stock-movements',
    data: { edition: editionId, quantity, reason, note, order: orderId ?? null },
    depth: 0,
    overrideAccess: true,
    req,
  })
}

/**
 * Take reward points off a customer's balance for an order, in one statement, so the same
 * points can never be spent twice by two orders at once. Returns false if they no longer have them.
 */
export const takePoints = async (payload: Payload, customerId: number, points: number, req?: Partial<PayloadRequest>): Promise<boolean> => {
  const db = await dbFor(payload, req)
  const result = await db.execute(
    sql`UPDATE customers SET reward_points = reward_points - ${points} WHERE id = ${customerId} AND reward_points >= ${points} RETURNING id`,
  )
  return (result.rows ?? result).length > 0
}
