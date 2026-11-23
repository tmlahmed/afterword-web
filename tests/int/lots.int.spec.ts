import { describe, expect, it } from 'vitest'

import { estimateCost, expensesTotal, landedCosts } from '../../src/lib/lots'
import { derivePrices, discountedPrice, effectiveDiscount } from '../../src/lib/pricing'
import { groupDiscountFor, pricesFor, type GroupRule } from '../../src/lib/repricing'
import type { Pricing } from '../../src/payload-types'

const pricing = {
  id: 1,
  rates: [
    { currency: 'INR', rate: 2, exchangeRate: 1.4 },
    { currency: 'GBP', rate: 165, exchangeRate: 160 },
  ],
  defaultDiscount: 15,
  defaultMargin: 1,
  roundTo: 10,
  typicalBuyDiscount: 35,
  minimumMargin: 20,
} as Pricing

describe('discounts', () => {
  it('takes a percentage off the listed price and rounds to the nearest ৳10', () => {
    expect(discountedPrice(1000, 15)).toBe(850)
    expect(discountedPrice(4730, 15)).toBe(4020)
    expect(discountedPrice(1400, 15)).toBe(1190)
  })
  it('uses the book’s own discount, else the shop’s, and a bigger group discount wins', () => {
    expect(effectiveDiscount(null, 15)).toBe(15)
    expect(effectiveDiscount(0, 15)).toBe(0)
    expect(effectiveDiscount(10, 15)).toBe(10)
    expect(effectiveDiscount(10, 15, 20)).toBe(20)
    expect(effectiveDiscount(25, 15, 20)).toBe(25)
  })
  it('shows the listed price struck through only when there is a discount', () => {
    expect(derivePrices(1000, null, null, 15)).toEqual({ price: 850, compareAtPrice: 1000 })
    expect(derivePrices(1000, null, null, 0)).toEqual({ price: 1000, compareAtPrice: null })
    expect(derivePrices(1000, 899, null, 15)).toEqual({ price: 899, compareAtPrice: 1000 })
  })
  it('prices a rupee book at printed × 2 less the shop discount', () => {
    expect(pricesFor({ kind: 'book', listPrice: 499, listCurrency: 'INR', priceOverride: null, discount: null, price: null }, pricing, 0)).toMatchObject({
      originalPrice: 1000,
      price: 850,
      compareAtPrice: 1000,
    })
  })
  it('gives gifts no shop discount, only one set on them or a group discount', () => {
    const item = { kind: 'item' as const, listPrice: 500, listCurrency: 'BDT' as const, priceOverride: null, discount: null, price: null }
    expect(pricesFor(item, pricing, 0)).toMatchObject({ price: 500, compareAtPrice: null })
    expect(pricesFor(item, pricing, 20)).toMatchObject({ price: 400, compareAtPrice: 500 })
  })
})

describe('group discounts', () => {
  const rule = (percent: number, over: Partial<GroupRule>): GroupRule => ({ id: 1, percent, subjects: new Set(), publishers: new Set(), editions: new Set(), ...over })
  it('covers books by subject, publisher or by name, taking the biggest', () => {
    const rules = [rule(20, { publishers: new Set([7]) }), rule(30, { subjects: new Set([3]) }), rule(10, { editions: new Set([42]) })]
    expect(groupDiscountFor({ id: 1, publisher: 7, subjects: [] }, rules)).toBe(20)
    expect(groupDiscountFor({ id: 1, publisher: 7, subjects: [3] }, rules)).toBe(30)
    expect(groupDiscountFor({ id: 42, publisher: null, subjects: [] }, rules)).toBe(10)
    expect(groupDiscountFor({ id: 2, publisher: 8, subjects: [{ id: 4 }] }, rules)).toBe(0)
  })
})

describe('landed cost', () => {
  it('converts at the rate paid and shares shipping by value', () => {
    // ₹699 at 40% off = ₹419.40, ₹599 at 30% off = ₹419.30; ৳1.4 per rupee; ৳1,000 of shipping.
    const [a, b] = landedCosts(
      [
        { quantity: 5, unitCost: 419.4 },
        { quantity: 3, unitCost: 419.3 },
      ],
      1.4,
      1000,
    )
    expect(a.unitCost).toBe(587.16)
    expect(b.unitCost).toBe(587.02)
    // Nearly equal values, so the ৳1,000 is shared about evenly per copy: ৳125 each.
    expect(a.landedCost).toBeCloseTo(712.16, 1)
    expect(b.landedCost).toBeCloseTo(712.02, 1)
    // Every taka of the shipment is accounted for.
    expect((a.landedCost! - a.unitCost!) * 5 + (b.landedCost! - b.unitCost!) * 3).toBeCloseTo(1000, 0)
  })
  it('gives a dearer book a bigger share', () => {
    const [cheap, dear] = landedCosts(
      [
        { quantity: 1, unitCost: 100 },
        { quantity: 1, unitCost: 300 },
      ],
      1,
      400,
    )
    expect(cheap.landedCost).toBe(200)
    expect(dear.landedCost).toBe(600)
  })
  it('shares costs by copies when nothing has a price, and leaves unpriced lines unknown otherwise', () => {
    expect(landedCosts([{ quantity: 4, unitCost: null }], 1, 400)[0].landedCost).toBe(100)
    expect(landedCosts([{ quantity: 1, unitCost: 100 }, { quantity: 1, unitCost: null }], 1, 0)[1].landedCost).toBeNull()
  })
  it('adds up shipment costs and estimates a cost from the printed price', () => {
    expect(expensesTotal([{ amount: 800 }, { amount: 200 }, {}])).toBe(1000)
    // ₹499 less 35% at ৳1.4 = ৳454.09
    expect(estimateCost({ listPrice: 499, listCurrency: 'INR', price: null }, pricing)).toBe(454.09)
    expect(estimateCost({ listPrice: 499, listCurrency: 'USD', price: null }, pricing)).toBeNull()
  })
})
