import 'server-only'

import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Edition } from '../payload-types'
import { availabilityOf } from './availability'
import { findPromotion, shopRules } from './orders/prepare'
import { type LineKind, plansFor, priceOrder, type Promotion, type RewardRules, type ShopRules, type Totals, type Zone } from './orders/pricing'
import { readBagToken } from './session'

export type BagLine = {
  edition: Pick<Edition, 'id' | 'title' | 'slug' | 'authorLine' | 'coverUrl' | 'price' | 'stockOnHand' | 'sourcing' | 'expectedDate' | 'leadTimeWeeks'>
  quantity: number
  kind: LineKind
  /** Shown beside the line: what will happen with this book. */
  note: string
  /** Set when the bag asks for more copies than are left. */
  problem?: string
}

export type Bag = {
  lines: BagLine[]
  count: number
  giftWrap: boolean
  giftNote: string
  promoCode: string | null
  promotion: Promotion | null
  promoRejected: boolean
  rules: ShopRules
  rewards: RewardRules
  /** Totals for a delivery zone, optionally with reward points (in taka) taken off. */
  totals: (zone: Zone, rewardCredit?: number) => Totals
}

const client = cache(async () => getPayload({ config }))

const findCart = async (token: string) => {
  const payload = await client()
  return (await payload.find({ collection: 'carts', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] ?? null
}

/** The bag for this browser, with every line priced and classified from the catalogue as it stands now. */
export const getBag = cache(async (): Promise<Bag> => {
  const payload = await client()
  const token = await readBagToken()
  const cart = token ? await findCart(token) : null
  const { rules, rewards, settings } = await shopRules({ payload })

  const lines: BagLine[] = []
  for (const item of cart?.items ?? []) {
    const id = typeof item.edition === 'object' ? item.edition.id : item.edition
    const book = await payload.findByID({ collection: 'editions', id, depth: 0, overrideAccess: true, disableErrors: true })
    if (!book || book.status !== 'published' || !book.price || book.sourcing === 'out_of_print') continue
    const availability = availabilityOf(book, settings)
    const onHand = book.stockOnHand ?? 0
    const kind: LineKind = availability.state === 'in_stock' ? 'in_stock' : availability.state === 'pre_order' ? 'pre_order' : 'on_request'
    lines.push({
      edition: book,
      quantity: item.quantity,
      kind,
      note: availability.detail,
      problem: kind === 'in_stock' && item.quantity > onHand ? `Only ${onHand} left — please reduce the quantity.` : undefined,
    })
  }

  const promotion = await findPromotion({ payload }, cart?.promoCode)
  const priced = lines.map((l) => ({ unitPrice: l.edition.price!, quantity: l.quantity, kind: l.kind }))
  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    giftWrap: Boolean(cart?.giftWrap),
    giftNote: cart?.giftNote ?? '',
    promoCode: promotion?.code ?? null,
    promotion,
    promoRejected: Boolean(cart?.promoCode) && !promotion,
    rules,
    rewards,
    totals: (zone, rewardCredit = 0) => priceOrder(priced, zone, rules, { giftWrap: Boolean(cart?.giftWrap), promotion, rewardCredit }),
  }
})

export const bagCount = async (): Promise<number> => {
  const token = await readBagToken()
  if (!token) return 0
  const cart = await findCart(token)
  return (cart?.items ?? []).reduce((n, i) => n + i.quantity, 0)
}

type CartChange = { items?: { edition: number; quantity: number }[]; giftWrap?: boolean; giftNote?: string; promoCode?: string | null }

/** Apply a change to the bag behind `token`, creating it if needed. */
export const changeBag = async (token: string, change: (current: { edition: number; quantity: number }[]) => CartChange): Promise<void> => {
  const payload = await client()
  const cart = await findCart(token)
  const current = (cart?.items ?? []).map((i) => ({ edition: typeof i.edition === 'object' ? i.edition.id : i.edition, quantity: i.quantity }))
  const data = change(current)
  if (cart) await payload.update({ collection: 'carts', id: cart.id, data, overrideAccess: true, depth: 0 })
  else await payload.create({ collection: 'carts', data: { token, items: [], ...data }, overrideAccess: true, depth: 0 })
}

export const emptyBag = async (token: string): Promise<void> => {
  const payload = await client()
  const cart = await findCart(token)
  if (cart) await payload.update({ collection: 'carts', id: cart.id, data: { items: [], giftWrap: false, giftNote: '', promoCode: null }, overrideAccess: true, depth: 0 })
}

export { plansFor }
