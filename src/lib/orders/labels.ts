/** What each order stage is called when shown to a customer. */
export const STAGE_LABEL: Record<string, string> = {
  placed: 'Received',
  awaiting_stock: 'Books on their way to Dhaka',
  packing: 'Being packed',
  shipped: 'With the courier',
  delivered: 'Delivered',
  returned: 'Returned to us',
  cancelled: 'Cancelled',
}

