import { describe, expect, it } from 'vitest'

import { availabilityOf } from '../../src/lib/availability'
import { isbn10to13, isValidIsbn13, normaliseIsbn } from '../../src/lib/isbn/isbn'
import { computePrice, derivePrices, discountPercent, formatTaka } from '../../src/lib/pricing'
import { slugify } from '../../src/lib/slug'

const rules = { rates: [{ currency: 'GBP', rate: 165 }, { currency: 'INR', rate: 1.45 }], margin: 1.2, roundTo: 10 }

describe('computePrice', () => {
  it('converts, applies margin and rounds up to the step', () => {
    // 9.99 x 165 x 1.2 = 1978.02 -> 1980
    expect(computePrice(9.99, 'GBP', rules)).toBe(1980)
    // 499 x 1.45 x 1.2 = 868.26 -> 870
    expect(computePrice(499, 'INR', rules)).toBe(870)
  })
  it('does not round an exact multiple up a step', () => {
    expect(computePrice(10, 'GBP', { ...rules, margin: 1 })).toBe(1650)
  })
  it('returns null when there is nothing to calculate from', () => {
    expect(computePrice(9.99, 'JPY', rules)).toBeNull()
    expect(computePrice(null, 'GBP', rules)).toBeNull()
    expect(computePrice(0, 'GBP', rules)).toBeNull()
  })
  it('applies margin only to taka list prices', () => {
    expect(computePrice(500, 'BDT', rules)).toBe(600)
  })
  it('formats taka with thousands separators', () => {
    expect(formatTaka(1650)).toBe('৳1,650')
  })
})

describe('ISBN handling', () => {
  it('accepts ISBN-13 with hyphens and spaces', () => {
    expect(normaliseIsbn('978-0-09-944882-2')).toBe('9780099448822')
  })
  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10to13('0099448823')).toBe('9780099448822')
    expect(normaliseIsbn('0099448823')).toBe('9780099448822')
  })
  it('rejects a wrong check digit and junk', () => {
    expect(isValidIsbn13('9780099448821')).toBe(false)
    expect(normaliseIsbn('9780099448821')).toBeNull()
    expect(normaliseIsbn('hello')).toBeNull()
  })
})

describe('availabilityOf', () => {
  it('is in stock when copies are on hand', () => {
    expect(availabilityOf({ sourcing: 'standard', stockOnHand: 3 }).state).toBe('in_stock')
  })
  it('warns when stock is low', () => {
    expect(availabilityOf({ sourcing: 'standard', stockOnHand: 1 }).detail).toContain('Only 1 left')
  })
  it('falls back to On Request with a lead time when none are on hand', () => {
    const a = availabilityOf({ sourcing: 'standard', stockOnHand: 0 }, { defaultLeadTimeWeeks: 5 })
    expect(a.state).toBe('on_request')
    expect(a.detail).toContain('5 to 7 weeks')
  })
  it('treats pre-orders as pre-orders even if copies have arrived', () => {
    expect(availabilityOf({ sourcing: 'pre_order', stockOnHand: 4 }).state).toBe('pre_order')
  })
  it('cannot be ordered when out of print', () => {
    expect(availabilityOf({ sourcing: 'out_of_print', stockOnHand: 2 }).orderable).toBe(false)
  })
})

describe('slugify', () => {
  it('strips accents and punctuation', () => {
    expect(slugify('Gabriel García Márquez')).toBe('gabriel-garcia-marquez')
    expect(slugify("Midnight's Children")).toBe('midnights-children')
    expect(slugify('Jonathan Strange & Mr Norrell')).toBe('jonathan-strange-and-mr-norrell')
  })
})


describe('original and selling prices', () => {
  it('sells at the original price when no selling price is set', () => {
    expect(derivePrices(1200, null)).toEqual({ price: 1200, compareAtPrice: null })
  })
  it('shows the original struck through when the selling price is lower', () => {
    expect(derivePrices(1200, 1020)).toEqual({ price: 1020, compareAtPrice: 1200 })
    expect(discountPercent(1020, 1200)).toBe(15)
  })
  it('shows no discount when the selling price is the same or higher', () => {
    expect(derivePrices(1200, 1300)).toEqual({ price: 1300, compareAtPrice: null })
    expect(discountPercent(1200, 1200)).toBeNull()
  })
  it('keeps a hand-set price for books with no list price', () => {
    expect(derivePrices(null, null, 950)).toEqual({ price: 950, compareAtPrice: null })
    expect(derivePrices(null, 900)).toEqual({ price: 900, compareAtPrice: null })
  })
})
