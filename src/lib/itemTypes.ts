/** Gifts and stationery: the kinds of things the shop sells that are not books. */
export const ITEM_TYPES = [
  { label: 'Bookmark', value: 'bookmark' },
  { label: 'Notebook or journal', value: 'notebook' },
  { label: 'Tote bag', value: 'tote' },
  { label: 'Pen or pencil', value: 'pen' },
  { label: 'Card or wrapping', value: 'card' },
  { label: 'Gift set', value: 'gift_set' },
  { label: 'Book accessory', value: 'accessory' },
  { label: 'Other', value: 'other' },
] as const

export const ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(ITEM_TYPES.map((t) => [t.value, t.label]))
