import { describe, expect, it } from 'vitest'

import { assessRisk } from '../../src/lib/orders/risk'

const clean = { refused: 0, delivered: 0, cancelled: 0 }

describe('cash-on-delivery risk', () => {
  it('never flags an order with nothing to collect', () => {
    expect(assessRisk({ payOnDelivery: 0 }, { ...clean, refused: 5 }, 3000).risk).toBe('none')
  })
  it('flags customers who refused parcels before', () => {
    expect(assessRisk({ payOnDelivery: 800 }, { ...clean, refused: 1, delivered: 3 }, 3000)).toEqual({ risk: 'check', riskNote: 'Refused a parcel before; 3 delivered' })
    expect(assessRisk({ payOnDelivery: 800 }, { ...clean, refused: 2 }, 3000).risk).toBe('high')
  })
  it('flags a large first cash order, but not a small one or a returning customer', () => {
    expect(assessRisk({ payOnDelivery: 4200 }, clean, 3000)).toEqual({ risk: 'check', riskNote: 'First order, ৳4,200 cash on delivery' })
    expect(assessRisk({ payOnDelivery: 1200 }, clean, 3000).risk).toBe('none')
    expect(assessRisk({ payOnDelivery: 4200 }, { ...clean, delivered: 1 }, 3000).risk).toBe('none')
  })
  it('flags customers whose earlier orders were all cancelled', () => {
    expect(assessRisk({ payOnDelivery: 900 }, { ...clean, cancelled: 2 }, 3000).risk).toBe('check')
  })
})
