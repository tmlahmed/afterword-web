import { sql } from '@payloadcms/db-postgres'
import type { CollectionConfig } from 'payload'

import { allow, nobody } from '../access/roles'
import { dbFor } from '../lib/orders/stock'

/**
 * One delivery of one book: how many copies came in, how many are left, and what each cost
 * once shipping and duty are shared out (the landed cost). Copies are sold oldest lot first,
 * so every sale knows what it cost. Lots are made by receiving a purchase order (or by any
 * other stock coming in) and counted down by the stock ledger; nobody edits the counts.
 */
export const StockLots: CollectionConfig = {
  slug: 'stock-lots',
  labels: { singular: 'Stock lot', plural: 'Stock lots' },
  admin: {
    useAsTitle: 'code',
    group: 'Stock and purchasing',
    defaultColumns: ['code', 'edition', 'remaining', 'quantity', 'landedCost', 'receivedAt'],
    description:
      'Each delivery of each book, with what the copies cost you. Sold oldest first. Counts change only through the stock ledger; a manager can correct an estimated cost.',
  },
  defaultSort: '-receivedAt',
  access: {
    read: allow('manager', 'warehouse', 'catalogue'),
    create: nobody,
    update: allow('manager'),
    delete: nobody,
  },
  hooks: {
    // "L-12": short enough to write on a sticker inside the back cover.
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === 'create' && !doc.code) {
          const code = `L-${doc.id}`
          const db = await dbFor(req.payload, req)
          await db.execute(sql`UPDATE stock_lots SET code = ${code} WHERE id = ${doc.id}`)
          return { ...doc, code }
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', index: true, label: 'Lot', admin: { readOnly: true, position: 'sidebar' } },
    {
      type: 'row',
      fields: [
        { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, index: true, label: 'Book', admin: { readOnly: true } },
        { name: 'purchaseOrder', type: 'relationship', relationTo: 'purchase-orders', label: 'Purchase order', admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'quantity', type: 'number', required: true, label: 'Copies in', admin: { readOnly: true } },
        { name: 'remaining', type: 'number', required: true, index: true, label: 'Copies left', admin: { readOnly: true } },
        { name: 'receivedAt', type: 'date', required: true, index: true, label: 'Received', admin: { readOnly: true, date: { displayFormat: 'd MMM yyyy' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'listPrice', type: 'number', label: 'Printed price', admin: { readOnly: true } },
        { name: 'listCurrency', type: 'select', options: ['GBP', 'USD', 'INR', 'EUR', 'BDT'], label: 'Currency', admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'unitCost', type: 'number', label: 'Bought for, each (৳)', admin: { readOnly: true, description: 'The supplier’s price in taka, before shipping and duty.' } },
        {
          name: 'landedCost',
          type: 'number',
          min: 0,
          label: 'Landed cost, each (৳)',
          admin: { description: 'What one copy cost you here, with its share of shipping, duty and other costs.' },
        },
        {
          name: 'estimated',
          type: 'checkbox',
          label: 'Cost is an estimate',
          admin: { description: 'Copies that arrived before costs were recorded. Correct the landed cost if you know it, then untick.' },
        },
      ],
    },
    { name: 'note', type: 'text' },
  ],
}
