export type CurrencyRate = { currency: string; rate: number }

export type PricingRules = {
  rates: CurrencyRate[]
  /** Multiplier applied after conversion, e.g. 1.2 for a 20% margin. */
  margin: number
  /** Prices are rounded up to a multiple of this many taka. */
  roundTo: number
}

/**
 * Selling price in whole taka from a publisher's list price:
 *   list price x your rate for that currency x margin, rounded up.
 * Returns null when the currency has no rate, so the caller can leave the price untouched.
 */
export const computePrice = (
  listPrice: number | null | undefined,
  currency: string | null | undefined,
  rules: PricingRules,
): number | null => {
  if (!listPrice || listPrice <= 0 || !currency) return null
  if (currency === 'BDT') return roundUp(listPrice * (rules.margin || 1), rules.roundTo)
  const rate = rules.rates.find((r) => r.currency === currency)?.rate
  if (!rate || rate <= 0) return null
  return roundUp(listPrice * rate * (rules.margin || 1), rules.roundTo)
}

const roundUp = (amount: number, step: number): number => {
  const unit = step && step > 0 ? step : 1
  // Guard against floating-point dust (e.g. 1500.0000000002) before rounding up.
  return Math.ceil(Number((amount / unit).toFixed(6))) * unit
}

/** "৳1,450" — whole taka with thousands separators. */
export const formatTaka = (amount: number): string => `৳${Math.round(amount).toLocaleString('en-IN')}`

/** A price less a percentage, rounded to the nearest step (৳1,000 less 15% is ৳850). */
export const discountedPrice = (original: number, percent: number, roundTo = 10): number => {
  const unit = roundTo > 0 ? roundTo : 1
  return Math.round(Number(((original * (1 - percent / 100)) / unit).toFixed(6))) * unit
}

/**
 * The discount a book gets: its own, or the shop's when it has none, and a group discount
 * (a sale on its subject, publisher or collection) when that is bigger. 0 means full price.
 */
export const effectiveDiscount = (book: number | null | undefined, shop: number | null | undefined, sale?: number | null): number => {
  const own = typeof book === 'number' && book >= 0 ? book : (shop ?? 0)
  return Math.min(100, Math.max(0, own, sale ?? 0))
}

/**
 * What a book sells for, from its listed price (the printed price converted to taka):
 * a fixed selling price set by staff wins; otherwise the listed price less the discount.
 * Whenever customers pay less than the listed price, the listed price is shown struck through.
 */
export const derivePrices = (
  original: number | null,
  selling: number | null | undefined,
  current?: number | null,
  discount = 0,
  roundTo = 10,
): { price: number | null; compareAtPrice: number | null } => {
  if (typeof selling === 'number' && selling > 0) {
    return { price: selling, compareAtPrice: original !== null && original > selling ? original : null }
  }
  if (original !== null && discount > 0) {
    const price = discountedPrice(original, discount, roundTo)
    return { price, compareAtPrice: price < original ? original : null }
  }
  return { price: original ?? current ?? null, compareAtPrice: null }
}

/** Whole-number discount, e.g. ৳1,200 → ৳1,020 is 15. Null when there is no saving. */
export const discountPercent = (price?: number | null, was?: number | null): number | null =>
  price && was && was > price ? Math.round(((was - price) / was) * 100) : null
