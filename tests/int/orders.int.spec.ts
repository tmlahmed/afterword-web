import { describe, expect, it } from 'vitest'

import { normalisePhone, plansFor, pointsEarned, pointsToSpend, priceOrder, splitPayment, zoneFor } from '../../src/lib/orders/pricing'

const rules = { insideDhakaFee: 70, outsideDhakaFee: 130, freeDeliveryAbove: 3000, giftWrapFee: 80, advancePercent: 50, codCeiling: 5000 }
const stock = (unitPrice: number, quantity = 1) => ({ unitPrice, quantity, kind: 'in_stock' as const })

describe('priceOrder', () => {
  it('adds the delivery fee for the zone', () => {
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules).total).toBe(1720)
    expect(priceOrder([stock(1650)], 'outside_dhaka', rules).total).toBe(1780)
  })
  it('makes delivery free at the threshold and says how far away it is below it', () => {
    expect(priceOrder([stock(1500, 2)], 'outside_dhaka', rules).delivery).toBe(0)
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules).freeDeliveryShortfall).toBe(1350)
  })
  it('applies percentage, fixed and free-delivery promotions', () => {
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules, { promotion: { code: 'A', type: 'percent', value: 10 } }).discount).toBe(165)
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules, { promotion: { code: 'B', type: 'fixed', value: 5000 } }).discount).toBe(1650)
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules, { promotion: { code: 'C', type: 'free_delivery', value: 0 } }).delivery).toBe(0)
  })
  it('ignores a promotion below its minimum spend', () => {
    expect(priceOrder([stock(900)], 'inside_dhaka', rules, { promotion: { code: 'A', type: 'percent', value: 10, minSubtotal: 1000 } }).discount).toBe(0)
  })
  it('judges free delivery on the price after discount', () => {
    expect(priceOrder([stock(3100)], 'inside_dhaka', rules, { promotion: { code: 'A', type: 'fixed', value: 200 } }).delivery).toBe(70)
  })
  it('charges gift wrap only when asked', () => {
    expect(priceOrder([stock(1000)], 'inside_dhaka', rules, { giftWrap: true }).giftWrap).toBe(80)
    expect(priceOrder([stock(1000)], 'inside_dhaka', rules).giftWrap).toBe(0)
  })
  it('asks for an advance on books that must be ordered in', () => {
    const t = priceOrder([stock(1000), { unitPrice: 1650, quantity: 1, kind: 'on_request' }], 'inside_dhaka', rules)
    expect(t.advanceDue).toBe(830) // half of 1650, rounded up to the next ten
  })
  it('asks for an advance on cash orders above the ceiling', () => {
    const t = priceOrder([stock(2000, 3)], 'inside_dhaka', rules)
    expect(t.total).toBe(6000)
    expect(t.advanceDue).toBe(3000)
  })
  it('asks for none on an ordinary in-stock order', () => {
    expect(priceOrder([stock(1650)], 'inside_dhaka', rules).advanceDue).toBe(0)
  })
})

describe('payment plans', () => {
  const plain = priceOrder([stock(1650)], 'inside_dhaka', rules)
  const special = priceOrder([{ unitPrice: 1650, quantity: 1, kind: 'pre_order' }], 'inside_dhaka', rules)
  it('offers cash on delivery only when no advance is due', () => {
    expect(plansFor(plain)).toEqual(['cod', 'full'])
    expect(plansFor(special)).toEqual(['advance', 'full'])
  })
  it('splits what is paid now from what the courier collects', () => {
    expect(splitPayment(plain, 'cod')).toEqual({ payNow: 0, payOnDelivery: 1720 })
    expect(splitPayment(special, 'advance')).toEqual({ payNow: 830, payOnDelivery: 890 })
    expect(splitPayment(special, 'full')).toEqual({ payNow: 1720, payOnDelivery: 0 })
  })
})

describe('phones and zones', () => {
  it('accepts the usual ways of writing a Bangladeshi mobile number', () => {
    for (const n of ['01712345678', '+8801712345678', '8801712345678', '017-1234-5678', '1712345678']) {
      expect(normalisePhone(n)).toBe('+8801712345678')
    }
  })
  it('rejects numbers that are not Bangladeshi mobiles', () => {
    for (const n of ['0171234567', '02123456789', '01212345678', 'hello', '']) expect(normalisePhone(n)).toBeNull()
  })
  it('treats only Dhaka district as inside Dhaka', () => {
    expect(zoneFor('Dhaka')).toBe('inside_dhaka')
    expect(zoneFor('Gazipur')).toBe('outside_dhaka')
  })
})

describe('reward points', () => {
  const rewards = { enabled: true, earnPerHundred: 1, redeemMinimum: 100, redeemMaxPercent: 20 }
  it('spends points up to the cap, never below the minimum', () => {
    expect(pointsToSpend(500, 1650, rewards)).toBe(330) // 20% of 1650
    expect(pointsToSpend(150, 1650, rewards)).toBe(150)
    expect(pointsToSpend(99, 1650, rewards)).toBe(0)
    expect(pointsToSpend(500, 1650, { ...rewards, enabled: false })).toBe(0)
  })
  it('takes points off the books but not delivery, and judges free delivery before points', () => {
    const t = priceOrder([stock(1650)], 'inside_dhaka', rules, { rewardCredit: 330 })
    expect(t.rewards).toBe(330)
    expect(t.delivery).toBe(70)
    expect(t.total).toBe(1650 - 330 + 70)
    const free = priceOrder([stock(3000)], 'inside_dhaka', rules, { rewardCredit: 600 })
    expect(free.delivery).toBe(0)
    expect(priceOrder([stock(100)], 'inside_dhaka', rules, { rewardCredit: 5000 }).rewards).toBe(100)
  })
  it('earns on what was paid for books', () => {
    expect(pointsEarned({ subtotal: 1650, discount: 165, rewards: 0 }, rewards)).toBe(14)
    expect(pointsEarned({ subtotal: 1650, discount: 0, rewards: 330 }, rewards)).toBe(13)
    expect(pointsEarned({ subtotal: 1650, discount: 0, rewards: 0 }, { ...rewards, enabled: false })).toBe(0)
  })
})
