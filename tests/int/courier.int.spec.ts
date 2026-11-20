import { describe, expect, it } from 'vitest'

import { buildBooking, findZoneIn, localPhone, matchCity, matchZone, outcomeOf, parcelWeight, statusText } from '../../src/lib/courier/pathao-rules'

const cities = [
  { id: 1, name: 'Dhaka' },
  { id: 2, name: 'Chittagong' },
  { id: 9, name: 'Bogra' },
  { id: 11, name: "Cox's Bazar" },
  { id: 32, name: 'B. Baria' },
]
const zones = [
  { id: 52, name: 'Adabor' },
  { id: 60, name: 'Dhanmondi' },
  { id: 70, name: 'Mirpur 10' },
  { id: 71, name: 'Mirpur 11' },
  { id: 80, name: 'Uttara Sector 4' },
]

describe('Pathao places', () => {
  it('matches our district names to Pathao cities, old spellings included', () => {
    expect(matchCity('Dhaka', cities)?.id).toBe(1)
    expect(matchCity('Chattogram', cities)?.id).toBe(2)
    expect(matchCity('Bogura', cities)?.id).toBe(9)
    expect(matchCity("Cox's Bazar", cities)?.id).toBe(11)
    expect(matchCity('Brahmanbaria', cities)?.id).toBe(32)
    expect(matchCity('Sylhet', cities)).toBeUndefined()
  })

  it('matches a zone only when it is clear', () => {
    expect(matchZone('Dhanmondi', zones)?.id).toBe(60)
    expect(matchZone('dhanmondi 27', zones)?.id).toBe(60)
    expect(matchZone('Mirpur 10', zones)?.id).toBe(70)
    expect(matchZone('Mirpur', zones)).toBeUndefined() // two Mirpur zones
    expect(matchZone('Uttara', zones)?.id).toBe(80)
    expect(matchZone('Gulshan', zones)).toBeUndefined()
    expect(matchZone('A', zones)).toBeUndefined()
  })

  it('finds the zone inside a full address when there is no separate area', () => {
    expect(findZoneIn('House 3, Road 14, Dhanmondi', zones)?.id).toBe(60)
    expect(findZoneIn('Flat 2B, Mirpur 10 roundabout', zones)?.id).toBe(70)
    expect(findZoneIn('Road 5, Mirpur', zones)).toBeUndefined()
    expect(findZoneIn('House 9, Gulshan Avenue', zones)).toBeUndefined()
  })
})

describe('Pathao bookings', () => {
  const input = {
    storeId: 535,
    reference: 'AW-100040-2',
    name: 'Test Reader',
    phone: '+8801712345678',
    street: 'House 3, Road 14',
    area: 'Dhanmondi',
    district: 'Dhaka',
    books: [{ grams: 300, quantity: 2 }, { quantity: 1 }],
    collect: 1150,
  }

  it('turns a parcel into a booking', () => {
    const built = buildBooking({ ...input, note: 'Call before coming', gift: true })
    if (!('booking' in built)) throw new Error(built.problem)
    expect(built.booking).toMatchObject({
      store_id: 535,
      merchant_order_id: 'AW-100040-2',
      recipient_phone: '01712345678',
      recipient_address: 'House 3, Road 14, Dhanmondi, Dhaka',
      delivery_type: 48,
      item_type: 2,
      item_quantity: 3,
      item_weight: 1.1, // 600 g + 400 g + 100 g packing
      amount_to_collect: 1150,
      special_instruction: 'Gift parcel. Call before coming',
    })
    expect(built.booking.recipient_city).toBeUndefined()
  })

  it('sends city and zone together or not at all', () => {
    const both = buildBooking({ ...input, city: cities[0], zone: zones[1] })
    const cityOnly = buildBooking({ ...input, city: cities[0] })
    expect('booking' in both && both.booking.recipient_zone).toBe(60)
    expect('booking' in cityOnly && cityOnly.booking.recipient_city).toBeUndefined()
  })

  it('refuses what Pathao would refuse, in words staff understand', () => {
    expect(buildBooking({ ...input, name: 'Al' })).toHaveProperty('problem')
    expect(buildBooking({ ...input, phone: '12345' })).toHaveProperty('problem')
    expect(buildBooking({ ...input, street: '', area: 'x', district: 'Dhk' })).toHaveProperty('problem')
    expect(buildBooking({ ...input, books: [{ grams: 1200, quantity: 9 }] })).toHaveProperty('problem')
  })

  it('weighs at least half a kilo', () => {
    expect(parcelWeight([{ grams: 200, quantity: 1 }])).toBe(0.5)
    expect(parcelWeight([{ quantity: 2 }])).toBe(0.9)
    expect(localPhone('+880 1712-345678')).toBe('01712345678')
  })
})

describe('Pathao statuses', () => {
  it('knows which statuses move a parcel on', () => {
    expect(outcomeOf('delivered')).toBe('delivered')
    expect(outcomeOf('order.delivered')).toBe('delivered')
    expect(outcomeOf('Payment_Invoice')).toBe('delivered')
    expect(outcomeOf('return')).toBe('returned')
    expect(outcomeOf('paid_return')).toBe('returned')
    expect(outcomeOf('pickup_cancelled')).toBe('pickup_cancelled')
    expect(outcomeOf('partial_delivery')).toBe('attention')
    expect(outcomeOf('delivery_failed')).toBe('moving')
    expect(outcomeOf('assigned_for_delivery')).toBe('moving')
    expect(outcomeOf('pending')).toBe('moving')
  })

  it('words a status for people', () => {
    expect(statusText('Pickup Requested', 'pickup_requested')).toBe('Pickup Requested')
    expect(statusText('', 'in_transit')).toBe('In transit')
  })
})
