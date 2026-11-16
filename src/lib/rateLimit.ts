
import { headers } from 'next/headers'

/**
 * A simple limit on how often one visitor can do something (ask for sign-in codes, place
 * orders, send requests). Counts are kept in memory, which suits the single server the shop
 * runs on; a restart clears them. The per-phone limits on sign-in codes are kept in the
 * database and survive restarts.
 */
type Bucket = { hits: number[] }
const buckets: Map<string, Bucket> = ((globalThis as { __awRate?: Map<string, Bucket> }).__awRate ??= new Map())

export const RULES = {
  otpRequest: { limit: 8, windowMs: 60 * 60_000 }, // codes asked for, any numbers, per hour
  otpVerify: { limit: 20, windowMs: 15 * 60_000 }, // codes tried
  order: { limit: 10, windowMs: 60 * 60_000 },
  request: { limit: 10, windowMs: 60 * 60_000 },
  bag: { limit: 120, windowMs: 60_000 },
} as const

export type RuleName = keyof typeof RULES

/** The visitor's address. Behind Cloudflare this is CF-Connecting-IP; behind Caddy alone, X-Real-IP. */
export const clientIp = async (): Promise<string> => {
  const h = await headers()
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/** Count one use. Returns false when the visitor has used up their allowance. */
export const hit = (rule: RuleName, key: string, now = Date.now()): boolean => {
  const { limit, windowMs } = RULES[rule]
  const id = `${rule}:${key}`
  const bucket = buckets.get(id) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    buckets.set(id, bucket)
    return false
  }
  bucket.hits.push(now)
  buckets.set(id, bucket)
  // Keep memory bounded: forget idle visitors now and then.
  if (buckets.size > 50_000) {
    for (const [k, b] of buckets) if (!b.hits.some((t) => now - t < 60 * 60_000)) buckets.delete(k)
  }
  return true
}

export const allowed = async (rule: RuleName): Promise<boolean> => hit(rule, await clientIp())
