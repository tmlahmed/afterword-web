import type { CollectionConfig } from 'payload'

import { allow, nobody } from '../access/roles'
import { courierModeEndpoint, orderActionEndpoint } from '../endpoints/orderAction'
import { receivePurchaseOrderEndpoint } from '../endpoints/receivePurchaseOrder'
import { afterOrderCreated, prepareOrder } from '../lib/orders/prepare'
import { DISTRICTS } from '../lib/orders/pricing'

const DISTRICT_OPTIONS = DISTRICTS.map((d) => ({ label: d, value: d }))

/** Shoppers. They sign in with a one-time code sent to their phone; there are no passwords. */
export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: {
    useAsTitle: 'phone',
    group: 'Orders',
    defaultColumns: ['phone', 'name', 'ordersCount', 'refusedCount', 'blocked'],
    listSearchableFields: ['phone', 'name', 'email'],
  },
  access: {
    read: allow('manager', 'orders'),
    create: allow('manager', 'orders'),
    update: allow('manager', 'orders'),
    delete: allow('owner'),
  },
  fields: [
    { name: 'phone', type: 'text', required: true, unique: true, index: true, admin: { description: 'In the form +8801XXXXXXXXX.' } },
    { name: 'name', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: 'address',
      type: 'group',
      label: 'Last delivery address',
      fields: [
        { name: 'district', type: 'select', options: DISTRICT_OPTIONS },
        { name: 'area', type: 'text' },
        { name: 'street', type: 'textarea' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'ordersCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        {
          name: 'refusedCount',
          type: 'number',
          defaultValue: 0,
          admin: { readOnly: true, description: 'Parcels refused or returned undelivered.' },
        },
      ],
    },
    {
      name: 'rewardPoints',
      type: 'number',
      defaultValue: 0,
      label: 'Reward points',
      admin: { readOnly: true, description: 'The total of this customer’s reward entries. Change it by adding an entry under Orders → Reward points.' },
    },
    {
      name: 'blocked',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'A blocked number cannot place orders.' },
    },
    { name: 'staffNotes', type: 'textarea' },
    { name: 'orders', type: 'join', collection: 'orders', on: 'customer' },
  ],
}

/** One-time sign-in codes. Never readable through the admin or the API. */
export const OtpCodes: CollectionConfig = {
  slug: 'otp-codes',
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'phone', type: 'text', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'used', type: 'checkbox', defaultValue: false },
  ],
}

/** A shopper's bag, found by a random token kept in their browser. */
export const Carts: CollectionConfig = {
  slug: 'carts',
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'token', type: 'text', required: true, unique: true, index: true },
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'edition', type: 'relationship', relationTo: 'editions', required: true },
        { name: 'quantity', type: 'number', required: true, min: 1, max: 20 },
      ],
    },
    { name: 'giftWrap', type: 'checkbox', defaultValue: false },
    { name: 'giftNote', type: 'text', maxLength: 240 },
    { name: 'promoCode', type: 'text' },
  ],
}

export const Promotions: CollectionConfig = {
  slug: 'promotions',
  admin: {
    useAsTitle: 'code',
    group: 'Orders',
    defaultColumns: ['code', 'type', 'value', 'used', 'active'],
    description: 'Codes customers type into the bag.',
  },
  access: {
    read: allow('manager', 'orders'),
    create: allow('manager'),
    update: allow('manager'),
    delete: allow('manager'),
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.code) data.code = String(data.code).trim().toUpperCase()
        return data
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'percent',
          options: [
            { label: 'Percentage off the books', value: 'percent' },
            { label: 'Fixed amount off (৳)', value: 'fixed' },
            { label: 'Free delivery', value: 'free_delivery' },
          ],
        },
        { name: 'value', type: 'number', min: 0, defaultValue: 0, admin: { condition: (data) => data?.type !== 'free_delivery' } },
        { name: 'minSubtotal', type: 'number', min: 0, label: 'Minimum spend (৳)' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startsAt', type: 'date' },
        { name: 'endsAt', type: 'date' },
        { name: 'usageLimit', type: 'number', min: 0, admin: { description: 'Leave empty for no limit.' } },
      ],
    },
    { name: 'active', type: 'checkbox', defaultValue: true },
    { name: 'used', type: 'number', defaultValue: 0, admin: { readOnly: true } },
  ],
}

export const ORDER_STATUSES = [
  { label: 'Placed — to confirm', value: 'placed' },
  { label: 'Awaiting stock', value: 'awaiting_stock' },
  { label: 'To pack', value: 'packing' },
  { label: 'With courier', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Returned', value: 'returned' },
  { label: 'Cancelled', value: 'cancelled' },
] as const

/**
 * Orders. Staff create one by filling in the customer, address and books; everything else —
 * prices, delivery, totals, stock — is worked out when it is saved. After that an order
 * changes only through its actions (confirm, pack, hand to courier…), never by editing fields.
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'number',
    group: 'Orders',
    defaultColumns: ['number', 'status', 'paymentStatus', 'contactName', 'total', 'createdAt'],
    listSearchableFields: ['number', 'contactName', 'contactPhone'],
    description: 'To take an order by phone or chat, press Create New, fill in the customer and the books, and save.',
  },
  defaultSort: '-createdAt',
  access: {
    read: allow('manager', 'orders', 'warehouse'),
    create: allow('manager', 'orders'),
    // Staff notes can be edited; the order itself moves through its actions.
    update: allow('manager', 'orders'),
    delete: nobody,
  },
  endpoints: [courierModeEndpoint, orderActionEndpoint],
  hooks: {
    beforeChange: [
      async ({ data, operation, req, context }) => (operation === 'create' ? prepareOrder(data, req, context) : data),
    ],
    afterChange: [
      async ({ doc, operation, req, context }) => (operation === 'create' ? afterOrderCreated(doc, req, context) : doc),
    ],
  },
  fields: [
    {
      name: 'actions',
      type: 'ui',
      admin: { components: { Field: '/components/admin/OrderActions#OrderActions' } },
    },
    {
      type: 'row',
      fields: [
        { name: 'number', type: 'text', index: true, admin: { readOnly: true, description: 'Given when the order is saved.' } },
        { name: 'status', type: 'select', required: true, defaultValue: 'placed', index: true, options: [...ORDER_STATUSES], admin: { readOnly: true } },
        {
          name: 'paymentStatus',
          type: 'select',
          required: true,
          defaultValue: 'unpaid',
          index: true,
          options: [
            { label: 'Nothing paid', value: 'unpaid' },
            { label: 'Payment to verify', value: 'to_verify' },
            { label: 'Advance paid', value: 'advance_paid' },
            { label: 'Paid in full', value: 'paid' },
            { label: 'Refunded', value: 'refunded' },
          ],
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Customer and delivery',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'contactName', type: 'text', required: true, label: 'Name' },
                { name: 'contactPhone', type: 'text', required: true, label: 'Phone', admin: { description: '01XXXXXXXXX' } },
                { name: 'contactEmail', type: 'email', label: 'Email (optional)' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'district', type: 'select', required: true, options: DISTRICT_OPTIONS },
                { name: 'area', type: 'text', required: true, label: 'Area or thana' },
              ],
            },
            { name: 'street', type: 'textarea', required: true, label: 'House, road and landmark' },
            { name: 'deliveryNote', type: 'text', label: 'Note for the courier' },
            {
              type: 'row',
              fields: [
                {
                  name: 'channel',
                  type: 'select',
                  defaultValue: 'phone',
                  options: [
                    { label: 'Website', value: 'web' },
                    { label: 'Phone', value: 'phone' },
                    { label: 'Facebook or Messenger', value: 'facebook' },
                    { label: 'WhatsApp', value: 'whatsapp' },
                    { label: 'Instagram', value: 'instagram' },
                  ],
                },
                { name: 'customer', type: 'relationship', relationTo: 'customers', admin: { readOnly: true, description: 'Matched by phone number when saved.' } },
              ],
            },
          ],
        },
        {
          label: 'Books',
          fields: [
            {
              name: 'lines',
              type: 'array',
              required: true,
              minRows: 1,
              labels: { singular: 'Book', plural: 'Books' },
              admin: { description: 'Choose the book and quantity. Prices and availability are filled in when you save.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, label: 'Book' },
                    { name: 'quantity', type: 'number', required: true, min: 1, max: 50, defaultValue: 1 },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'title', type: 'text', admin: { readOnly: true } },
                    { name: 'unitPrice', type: 'number', label: 'Price each (৳)', admin: { readOnly: true } },
                    {
                      name: 'kind',
                      type: 'select',
                      options: [
                        { label: 'From stock', value: 'in_stock' },
                        { label: 'Pre-order', value: 'pre_order' },
                        { label: 'On Request', value: 'on_request' },
                      ],
                      admin: { readOnly: true },
                    },
                    { name: 'allocated', type: 'checkbox', label: 'Copies set aside', admin: { readOnly: true } },
                    { name: 'parcel', type: 'number', defaultValue: 0, label: 'Parcel', admin: { readOnly: true, description: '0 = first parcel, 1 = second.' } },
                  ],
                },
                { name: 'authorLine', type: 'text', admin: { hidden: true } },
                { name: 'isbn13', type: 'text', admin: { hidden: true } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'giftWrap', type: 'checkbox', defaultValue: false },
                { name: 'promoCode', type: 'text', label: 'Promotion code' },
                {
                  name: 'deliveryPlan',
                  type: 'select',
                  defaultValue: 'split',
                  label: 'Delivery',
                  options: [
                    { label: 'Books in stock now, the rest when they arrive', value: 'split' },
                    { label: 'Everything together when all books are here', value: 'together' },
                  ],
                  admin: { description: 'Only matters when the order has books in stock and books to order in. No second delivery fee either way.' },
                },
                {
                  name: 'usePoints',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Use the customer’s reward points',
                  admin: { description: 'As many as the rules allow. Worked out when you save.' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'pointsUsed', type: 'number', defaultValue: 0, label: 'Points spent', admin: { readOnly: true } },
                { name: 'pointsEarned', type: 'number', defaultValue: 0, label: 'Points earned', admin: { readOnly: true, description: 'Given when the order is delivered.' } },
              ],
            },
            { name: 'giftNote', type: 'text', maxLength: 240, admin: { condition: (data) => Boolean(data?.giftWrap) } },
          ],
        },
        {
          label: 'Payment',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'paymentPlan',
                  type: 'select',
                  required: true,
                  defaultValue: 'cod',
                  options: [
                    { label: 'Cash on delivery', value: 'cod' },
                    { label: 'Advance now, balance on delivery', value: 'advance' },
                    { label: 'Paid in full before dispatch', value: 'full' },
                  ],
                },
                {
                  name: 'payNowVia',
                  type: 'select',
                  label: 'Paying now by',
                  options: [
                    { label: 'bKash (sent to our number)', value: 'bkash_manual' },
                    { label: 'bKash (paid online)', value: 'bkash' },
                    { label: 'Card or wallet (online gateway)', value: 'sslcommerz' },
                  ],
                  admin: { condition: (data) => data?.paymentPlan !== 'cod' },
                },
                { name: 'paymentReference', type: 'text', label: 'bKash transaction ID', admin: { condition: (data) => data?.payNowVia === 'bkash_manual' } },
                {
                  name: 'paymentSender',
                  type: 'text',
                  label: 'bKash number paid from',
                  admin: { condition: (data) => data?.payNowVia === 'bkash_manual', description: 'The customer’s bKash number the money was sent from.' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'subtotal', type: 'number', label: 'Books (৳)', admin: { readOnly: true } },
                { name: 'discount', type: 'number', label: 'Discount (৳)', admin: { readOnly: true } },
                { name: 'rewardDiscount', type: 'number', label: 'Paid with points (৳)', admin: { readOnly: true } },
                { name: 'delivery', type: 'number', label: 'Delivery (৳)', admin: { readOnly: true } },
                { name: 'giftWrapFee', type: 'number', label: 'Gift wrap (৳)', admin: { readOnly: true } },
                { name: 'total', type: 'number', label: 'Total (৳)', admin: { readOnly: true } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'payNow', type: 'number', label: 'Due before dispatch (৳)', admin: { readOnly: true } },
                { name: 'paid', type: 'number', label: 'Paid so far (৳)', defaultValue: 0, admin: { readOnly: true } },
                { name: 'payOnDelivery', type: 'number', label: 'Courier collects (৳)', admin: { readOnly: true } },
              ],
            },
            {
              name: 'payments',
              type: 'array',
              admin: { readOnly: true, description: 'Money received. Recorded by the order actions.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'amount', type: 'number', required: true },
                    { name: 'method', type: 'text', required: true },
                    { name: 'reference', type: 'text' },
                    { name: 'at', type: 'date', required: true },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Delivery and history',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'courier', type: 'text', admin: { readOnly: true } },
                { name: 'trackingId', type: 'text', label: 'Tracking number', admin: { readOnly: true } },
                { name: 'zone', type: 'select', options: [{ label: 'Inside Dhaka', value: 'inside_dhaka' }, { label: 'Outside Dhaka', value: 'outside_dhaka' }], admin: { readOnly: true } },
              ],
            },
            {
              name: 'parcels',
              type: 'array',
              labels: { singular: 'Parcel', plural: 'Parcels' },
              admin: { readOnly: true, description: 'One parcel, or two when books in stock go first and the rest follow. Moved on by the actions at the top.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'status',
                      type: 'select',
                      required: true,
                      defaultValue: 'pending',
                      options: [
                        { label: 'Waiting for books', value: 'pending' },
                        { label: 'To pack', value: 'packing' },
                        { label: 'With courier', value: 'shipped' },
                        { label: 'Delivered', value: 'delivered' },
                        { label: 'Returned', value: 'returned' },
                        { label: 'Cancelled', value: 'cancelled' },
                      ],
                    },
                    { name: 'collect', type: 'number', label: 'Courier collects (৳)' },
                    { name: 'courier', type: 'text' },
                    { name: 'trackingId', type: 'text', label: 'Tracking number' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'courierStatus', type: 'text', label: 'Courier says' },
                    { name: 'courierFee', type: 'number', label: 'Courier’s charge (৳)' },
                    { name: 'courierCheckedAt', type: 'date', label: 'Last checked', admin: { date: { pickerAppearance: 'dayAndTime' } } },
                  ],
                },
              ],
            },
            {
              name: 'timeline',
              type: 'array',
              admin: { readOnly: true },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'at', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
                    { name: 'event', type: 'text', required: true },
                    { name: 'by', type: 'text' },
                  ],
                },
              ],
            },
            { name: 'staffNotes', type: 'textarea', admin: { description: 'For staff only. Never shown to the customer.' } },
          ],
        },
      ],
    },
    { name: 'token', type: 'text', index: true, admin: { hidden: true } },
  ],
}

/** "On Request": a customer asks for a book we do not list. */
export const Requests: CollectionConfig = {
  slug: 'requests',
  labels: { singular: 'Book request', plural: 'Book requests' },
  admin: {
    useAsTitle: 'wanted',
    group: 'Orders',
    defaultColumns: ['wanted', 'contactName', 'contactPhone', 'status', 'createdAt'],
    description:
      'To answer a request: add the book to the catalogue (by ISBN), set its price and lead time, link it below and set the status to Quoted. The customer then orders it like any other book, paying the advance.',
  },
  defaultSort: '-createdAt',
  access: {
    read: allow('manager', 'orders', 'catalogue'),
    create: allow('manager', 'orders'),
    update: allow('manager', 'orders', 'catalogue'),
    delete: allow('manager'),
  },
  fields: [
    { name: 'wanted', type: 'text', required: true, label: 'Book wanted', admin: { description: 'Title and author, as the customer wrote it.' } },
    { name: 'isbn', type: 'text', label: 'ISBN (if given)' },
    { name: 'note', type: 'textarea', label: 'Customer’s note' },
    {
      type: 'row',
      fields: [
        { name: 'contactName', type: 'text', required: true },
        { name: 'contactPhone', type: 'text', required: true },
        { name: 'customer', type: 'relationship', relationTo: 'customers', admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'new',
          index: true,
          options: [
            { label: 'New — to quote', value: 'new' },
            { label: 'Quoted — waiting for the customer', value: 'quoted' },
            { label: 'Ordered by the customer', value: 'ordered' },
            { label: 'Cannot supply', value: 'declined' },
            { label: 'Closed', value: 'closed' },
          ],
        },
        { name: 'edition', type: 'relationship', relationTo: 'editions', label: 'The book, once added to the catalogue' },
      ],
    },
    { name: 'reply', type: 'textarea', label: 'Reply to the customer', admin: { description: 'Shown on their account page.' } },
  ],
}

export const PurchaseOrders: CollectionConfig = {
  slug: 'purchase-orders',
  admin: {
    useAsTitle: 'reference',
    group: 'Stock and purchasing',
    defaultColumns: ['reference', 'supplier', 'status', 'expectedDate'],
    description: 'What has been ordered from a supplier. Receiving it adds the stock and releases waiting customer orders.',
  },
  defaultSort: '-createdAt',
  access: {
    read: allow('manager', 'warehouse', 'catalogue'),
    create: allow('manager'),
    update: allow('manager', 'warehouse'),
    delete: allow('manager'),
  },
  endpoints: [receivePurchaseOrderEndpoint],
  fields: [
    { name: 'receive', type: 'ui', admin: { components: { Field: '/components/admin/ReceiveStock#ReceiveStock' } } },
    {
      type: 'row',
      fields: [
        { name: 'reference', type: 'text', required: true, admin: { description: 'Your own reference or the supplier’s invoice number.' } },
        { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'ordered',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Ordered — in transit', value: 'ordered' },
            { label: 'Received', value: 'received' },
          ],
          admin: { readOnly: true },
        },
        { name: 'expectedDate', type: 'date', label: 'Expected in Dhaka', admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' } } },
      ],
    },
    {
      name: 'lines',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Book', plural: 'Books' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, label: 'Book' },
            { name: 'quantity', type: 'number', required: true, min: 1, defaultValue: 1 },
            { name: 'unitCost', type: 'number', min: 0, label: 'Cost each' },
          ],
        },
      ],
    },
    { name: 'notes', type: 'textarea' },
    { name: 'receivedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
}

/** Every SMS and email sent, for the record. */
export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Message sent', plural: 'Messages sent' },
  admin: { group: 'Orders', useAsTitle: 'to', defaultColumns: ['to', 'kind', 'body', 'status', 'createdAt'] },
  defaultSort: '-createdAt',
  access: { read: allow('manager', 'orders'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'to', type: 'text', required: true, index: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'status', type: 'select', required: true, options: ['sent', 'logged', 'failed'], defaultValue: 'logged' },
    { name: 'order', type: 'relationship', relationTo: 'orders' },
  ],
}
