/**
 * Order arithmetic, kept free of the database so it can be tested on its own.
 * All amounts are whole taka.
 */
export type Zone = 'inside_dhaka' | 'outside_dhaka'
export type LineKind = 'in_stock' | 'pre_order' | 'on_request'
export type PaymentPlan = 'cod' | 'advance' | 'full'

export type PricedLine = { unitPrice: number; quantity: number; kind: LineKind }

export type ShopRules = {
  insideDhakaFee: number
  outsideDhakaFee: number
  /** Delivery is free when the books come to at least this much. 0 switches the offer off. */
  freeDeliveryAbove: number
  giftWrapFee: number
  /** Share of pre-order and On Request lines paid up front, 0–100. */
  advancePercent: number
  /** Cash on delivery above this total needs an advance. 0 means no ceiling. */
  codCeiling: number
}

export type Promotion = {
  code: string
  type: 'percent' | 'fixed' | 'free_delivery'
  value: number
  minSubtotal?: number | null
}

export type Totals = {
  subtotal: number
  discount: number
  /** Taka taken off by reward points. */
  rewards: number
  delivery: number
  giftWrap: number
  total: number
  /** The least the customer must pay before we act on the order. */
  advanceDue: number
  freeDeliveryShortfall: number
}

const roundUp10 = (n: number) => Math.ceil(n / 10) * 10

export const zoneFor = (district: string): Zone => (district.trim().toLowerCase() === 'dhaka' ? 'inside_dhaka' : 'outside_dhaka')

export const promotionApplies = (promo: Promotion | null | undefined, subtotal: number): promo is Promotion =>
  Boolean(promo) && subtotal >= (promo!.minSubtotal ?? 0)

export const priceOrder = (
  lines: PricedLine[],
  zone: Zone,
  rules: ShopRules,
  options: { giftWrap?: boolean; promotion?: Promotion | null; rewardCredit?: number } = {},
): Totals => {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const promo = promotionApplies(options.promotion, subtotal) ? options.promotion : null

  let discount = 0
  if (promo?.type === 'percent') discount = Math.floor((subtotal * Math.min(promo.value, 100)) / 100)
  if (promo?.type === 'fixed') discount = Math.min(promo.value, subtotal)

  const baseFee = zone === 'inside_dhaka' ? rules.insideDhakaFee : rules.outsideDhakaFee
  const freeByThreshold = rules.freeDeliveryAbove > 0 && subtotal - discount >= rules.freeDeliveryAbove
  const delivery = lines.length === 0 || freeByThreshold || promo?.type === 'free_delivery' ? 0 : baseFee
  const giftWrap = options.giftWrap ? rules.giftWrapFee : 0
  // Points come off the books only (never delivery), after any promotion.
  const rewards = Math.max(0, Math.min(Math.floor(options.rewardCredit ?? 0), subtotal - discount))
  const total = subtotal - discount - rewards + delivery + giftWrap

  // Advance: a share of anything we must order in, and of any cash order above the ceiling.
  const backorder = lines.filter((l) => l.kind !== 'in_stock').reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  let advanceDue = backorder > 0 ? roundUp10((backorder * rules.advancePercent) / 100) : 0
  if (rules.codCeiling > 0 && total > rules.codCeiling) {
    advanceDue = Math.max(advanceDue, roundUp10((total * rules.advancePercent) / 100))
  }
  advanceDue = Math.min(advanceDue, total)

  return {
    subtotal,
    discount,
    rewards,
    delivery,
    giftWrap,
    total,
    advanceDue,
    freeDeliveryShortfall:
      rules.freeDeliveryAbove > 0 && !freeByThreshold ? Math.max(0, rules.freeDeliveryAbove - (subtotal - discount)) : 0,
  }
}

/** What is paid now and what the courier collects, for the plan the customer chose. */
export const splitPayment = (totals: Totals, plan: PaymentPlan): { payNow: number; payOnDelivery: number } => {
  if (plan === 'full') return { payNow: totals.total, payOnDelivery: 0 }
  if (plan === 'advance') return { payNow: totals.advanceDue, payOnDelivery: totals.total - totals.advanceDue }
  return { payNow: 0, payOnDelivery: totals.total }
}

/** Plans the customer may choose. Cash on delivery is offered only when no advance is needed. */
export const plansFor = (totals: Totals): PaymentPlan[] =>
  totals.advanceDue > 0 ? (totals.advanceDue < totals.total ? ['advance', 'full'] : ['full']) : ['cod', 'full']

/** 01XXXXXXXXX in any common spelling -> +8801XXXXXXXXX. Null if it is not a Bangladeshi mobile number. */
export const normalisePhone = (input: string): string | null => {
  const digits = input.replace(/[^\d]/g, '')
  const local = digits.startsWith('880') ? digits.slice(2) : digits.startsWith('0') ? digits : `0${digits}`
  return /^01[3-9]\d{8}$/.test(local) ? `+88${local}` : null
}

export const DISTRICTS = [
  'Dhaka', 'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur',
  'Chapainawabganj', 'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla', 'Dinajpur', 'Faridpur', 'Feni',
  'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore', 'Jhalokathi', 'Jhenaidah', 'Joypurhat',
  'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur', 'Lalmonirhat', 'Madaripur',
  'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar', 'Munshiganj', 'Mymensingh', 'Naogaon', 'Narail',
  'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona', 'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh',
  'Patuakhali', 'Pirojpur', 'Rajbari', 'Rajshahi', 'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur',
  'Sirajganj', 'Sunamganj', 'Sylhet', 'Tangail', 'Thakurgaon',
] as const

// --- Rewards ------------------------------------------------------------------

/** One point is worth one taka when spent. */
export type RewardRules = {
  enabled: boolean
  /** Points earned for every ৳100 spent on books (after discounts and points). */
  earnPerHundred: number
  /** Fewest points that can be spent at once. */
  redeemMinimum: number
  /** Most of the books' price that points may pay, 0–100. */
  redeemMaxPercent: number
}

/** How many points can go towards this order, given the customer's balance. */
export const pointsToSpend = (balance: number, booksAfterDiscount: number, rules: RewardRules): number => {
  if (!rules.enabled || balance < rules.redeemMinimum || booksAfterDiscount <= 0) return 0
  const cap = Math.floor((booksAfterDiscount * Math.min(100, Math.max(0, rules.redeemMaxPercent))) / 100)
  return Math.max(0, Math.min(Math.floor(balance), cap))
}

/** Points earned when an order is delivered: on what was paid for books, never delivery or gift wrap. */
export const pointsEarned = (totals: Pick<Totals, 'subtotal' | 'discount' | 'rewards'>, rules: RewardRules): number =>
  rules.enabled ? Math.floor(((totals.subtotal - totals.discount - (totals.rewards ?? 0)) / 100) * rules.earnPerHundred) : 0
