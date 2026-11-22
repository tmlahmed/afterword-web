export type AvailabilityState = 'in_stock' | 'pre_order' | 'on_request' | 'unavailable'

export type Availability = {
  state: AvailabilityState
  /** Two or three words for cards and badges. */
  label: string
  /** One sentence for the book page. */
  detail: string
  /** Whether the book can be ordered at all. */
  orderable: boolean
}

type BookStock = {
  /** 'item' for gifts and stationery, which are never ordered in from abroad. */
  kind?: 'book' | 'item' | null
  sourcing?: 'standard' | 'pre_order' | 'out_of_print' | null
  stockOnHand?: number | null
  expectedDate?: string | null
  leadTimeWeeks?: number | null
}

type ShopDefaults = { defaultLeadTimeWeeks?: number | null; dispatchPromise?: string | null }

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })

/**
 * Every book is in exactly one of three orderable states — in stock in Dhaka, pre-order,
 * or ordered from abroad on request — or it is unavailable. The state is worked out from
 * the stock ledger, never typed in.
 */
export const availabilityOf = (book: BookStock, shop: ShopDefaults = {}): Availability => {
  if (book.sourcing === 'out_of_print') {
    return { state: 'unavailable', label: 'Out of print', detail: 'This edition can no longer be supplied.', orderable: false }
  }
  if (book.sourcing === 'pre_order') {
    return {
      state: 'pre_order',
      label: 'Pre-order',
      detail: book.expectedDate
        ? `Expected in Dhaka on ${formatDate(book.expectedDate)}.`
        : 'Arrival date to be confirmed. We will tell you as soon as we know.',
      orderable: true,
    }
  }
  const onHand = book.stockOnHand ?? 0
  if (onHand > 0) {
    const promise = shop.dispatchPromise || 'Ships next working day from Dhaka'
    return {
      state: 'in_stock',
      label: 'In stock',
      detail: onHand <= 2 ? `${promise}. Only ${onHand} left.` : `${promise}.`,
      orderable: true,
    }
  }
  // Gifts and stationery come only from our own shelves: none left means sold out.
  if (book.kind === 'item') {
    return { state: 'unavailable', label: 'Sold out', detail: 'Sold out for now. We will have more soon.', orderable: false }
  }
  const weeks = book.leadTimeWeeks || shop.defaultLeadTimeWeeks || 4
  return {
    state: 'on_request',
    label: 'On Request',
    detail: `Not on our shelves today. We order it from abroad for you: about ${weeks} to ${weeks + 2} weeks.`,
    orderable: true,
  }
}
