/**
 * The parts of the Pathao integration that need no network: turning an order's parcel into a
 * Pathao booking, matching our districts and areas to Pathao's cities and zones, and reading
 * what a Pathao status means for the parcel. Kept apart so they can be tested on their own.
 */

export type PathaoPlace = { id: number; name: string }

export type PathaoBooking = {
  store_id: number
  merchant_order_id: string
  recipient_name: string
  recipient_phone: string
  recipient_address: string
  recipient_city?: number
  recipient_zone?: number
  delivery_type: 48 | 12
  item_type: 1 | 2
  special_instruction?: string
  item_quantity: number
  item_weight: number
  item_description: string
  amount_to_collect: number
}

/** Letters and digits only, lower case: "Cox's Bazar " and "coxs bazar" are the same place; "Mirpur 10" is not "Mirpur 11". */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Our district names follow the current official spelling; Pathao uses the older one for some.
const CITY_ALIASES: Record<string, string> = {
  barishal: 'barisal',
  bogura: 'bogra',
  brahmanbaria: 'bbaria',
  chattogram: 'chittagong',
  gopalganj: 'gopalgonj',
  jhenaidah: 'jhenidah',
  khagrachhari: 'khagrachari',
  munshiganj: 'munsiganj',
  narsingdi: 'narshingdi',
  netrokona: 'netrakona',
}

export const matchCity = (district: string, cities: PathaoPlace[]): PathaoPlace | undefined => {
  const want = CITY_ALIASES[key(district)] ?? key(district)
  return cities.find((c) => key(c.name) === want)
}

/**
 * The Pathao zone for the area the customer typed, only when the match is clear. When it is
 * not, we send no city or zone and Pathao works them out from the address.
 */
export const matchZone = (area: string, zones: PathaoPlace[]): PathaoPlace | undefined => {
  const want = key(area)
  if (want.length < 3) return undefined
  const exact = zones.find((z) => key(z.name) === want)
  if (exact) return exact
  // "Dhanmondi 27" → "Dhanmondi"; "Mirpur" → "Mirpur 10" only if just one zone starts that way.
  const inside = zones.filter((z) => key(z.name).length >= 4 && want.startsWith(key(z.name))).sort((a, b) => key(b.name).length - key(a.name).length)
  if (inside[0]) return inside[0]
  const longer = zones.filter((z) => key(z.name).startsWith(want))
  return longer.length === 1 ? longer[0] : undefined
}

/** Pathao wants 01XXXXXXXXX. */
export const localPhone = (phone: string): string => {
  const digits = phone.replace(/[^\d]/g, '')
  return digits.startsWith('880') ? digits.slice(2) : digits
}

const GRAMS_PER_BOOK = 400
const PACKING_GRAMS = 100

/** Parcel weight in kg for Pathao: our recorded weights (or 400 g a book), plus packing, from 0.5 to 10 kg. */
export const parcelWeight = (books: { grams?: number | null; quantity: number }[]): number => {
  const grams = books.reduce((sum, b) => sum + (b.grams && b.grams > 0 ? b.grams : GRAMS_PER_BOOK) * b.quantity, PACKING_GRAMS)
  return Math.max(0.5, Math.ceil(grams / 100) / 10)
}
export const MAX_WEIGHT_KG = 10

export type BookingInput = {
  storeId: number
  reference: string
  name: string
  phone: string
  street: string
  area: string
  district: string
  note?: string | null
  gift?: boolean
  books: { grams?: number | null; quantity: number }[]
  collect: number
  city?: PathaoPlace
  zone?: PathaoPlace
}

/** The booking Pathao is sent, or the reason it cannot be booked. */
export const buildBooking = (input: BookingInput): { booking: PathaoBooking } | { problem: string } => {
  const name = input.name.trim().slice(0, 64)
  if (name.length < 3) return { problem: 'Pathao needs a name of at least 3 letters. Add the customer’s full name to the order first.' }
  const phone = localPhone(input.phone)
  if (!/^01[3-9]\d{8}$/.test(phone)) return { problem: 'The phone number is not a Bangladeshi mobile number Pathao accepts.' }
  const address = [input.street, input.area, input.district]
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ')
    .slice(0, 220)
  if (address.length < 10) return { problem: 'The address is too short for Pathao. Add the house, road and area.' }
  const weight = parcelWeight(input.books)
  if (weight > MAX_WEIGHT_KG) return { problem: `This parcel weighs about ${weight} kg; Pathao takes up to ${MAX_WEIGHT_KG} kg. Book it by hand in two parts.` }
  const quantity = input.books.reduce((n, b) => n + b.quantity, 0)
  const instruction = [input.gift ? 'Gift parcel.' : '', input.note?.trim() ?? ''].filter(Boolean).join(' ').slice(0, 250)

  const booking: PathaoBooking = {
    store_id: input.storeId,
    merchant_order_id: input.reference,
    recipient_name: name,
    recipient_phone: phone,
    recipient_address: address,
    delivery_type: 48,
    item_type: 2,
    item_quantity: quantity,
    item_weight: weight,
    item_description: `${quantity} ${quantity === 1 ? 'book' : 'books'}, order ${input.reference}`,
    amount_to_collect: Math.max(0, Math.round(input.collect)),
  }
  if (instruction) booking.special_instruction = instruction
  // Pathao wants a city and a zone together, or neither.
  if (input.city && input.zone) {
    booking.recipient_city = input.city.id
    booking.recipient_zone = input.zone.id
  }
  return { booking }
}

/**
 * What a Pathao status means for our parcel.
 * - delivered / returned: move the parcel on.
 * - pickup_cancelled: the parcel never left; it goes back to "To pack".
 * - attention: partly delivered or exchanged; staff decide.
 * - moving: anything else, which we only show.
 */
export type CourierOutcome = 'delivered' | 'returned' | 'pickup_cancelled' | 'attention' | 'moving'

export const outcomeOf = (slug: string | null | undefined): CourierOutcome => {
  const s = (slug ?? '').toLowerCase().replace(/^order\./, '').replace(/[\s-]+/g, '_')
  if (s === 'delivered' || s === 'payment_invoice' || s === 'paid') return 'delivered'
  if (s === 'return' || s === 'returned' || s === 'paid_return') return 'returned'
  if (s === 'pickup_cancelled' || s === 'pickup_cancel' || s === 'cancelled') return 'pickup_cancelled'
  if (s === 'partial_delivery' || s === 'exchange' || s === 'exchanged') return 'attention'
  return 'moving'
}

/** "pickup_requested" → "Pickup requested", for when Pathao sends no wording of its own. */
export const statusText = (status: string | null | undefined, slug: string | null | undefined): string => {
  if (status?.trim()) return status.trim()
  const s = (slug ?? '').replace(/^order\./, '').replace(/[_-]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Unknown'
}
