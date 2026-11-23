import type { CollectionConfig } from 'payload'

import { allow } from '../access/roles'
import { scheduleReprice } from '../lib/repricing'

/**
 * A discount on a group of books for a while: "20% off Penguin Classics this week". It covers
 * any book in the chosen subjects, publishers or collections, or picked one by one. A book
 * gets the bigger of this and its own discount; books with a fixed price are left alone.
 * Prices change within a quarter of an hour of the start and end (pnpm prices:sync).
 */
export const GroupDiscounts: CollectionConfig = {
  slug: 'group-discounts',
  labels: { singular: 'Group discount', plural: 'Group discounts' },
  admin: {
    useAsTitle: 'name',
    group: 'Orders',
    defaultColumns: ['name', 'percent', 'active', 'startsAt', 'endsAt'],
    description: 'A discount on a whole subject, publisher or collection, with optional start and end dates. Books keep their own discount when it is bigger.',
  },
  access: {
    read: allow('manager', 'catalogue', 'orders'),
    create: allow('manager', 'catalogue'),
    update: allow('manager', 'catalogue'),
    delete: allow('manager'),
  },
  hooks: {
    afterChange: [
      ({ doc, req }) => {
        scheduleReprice(req.payload, `group discount "${doc.name}" saved`)
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req }) => {
        scheduleReprice(req.payload, `group discount "${doc.name}" deleted`)
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, admin: { description: 'For staff, e.g. “Penguin Classics week”.' } },
        { name: 'percent', type: 'number', required: true, min: 1, max: 90, label: 'Discount (%)' },
        { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Untick to stop it at once.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startsAt', type: 'date', label: 'Starts', admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Empty: straight away.' } },
        { name: 'endsAt', type: 'date', label: 'Ends', admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Empty: until you untick it.' } },
      ],
    },
    { name: 'subjects', type: 'relationship', relationTo: 'subjects', hasMany: true, admin: { description: 'Every book in these subjects.' } },
    { name: 'publishers', type: 'relationship', relationTo: 'publishers', hasMany: true, admin: { description: 'Every book from these publishers.' } },
    { name: 'lists', type: 'relationship', relationTo: 'lists', hasMany: true, label: 'Collections', admin: { description: 'Every book in these collections.' } },
    { name: 'books', type: 'relationship', relationTo: 'editions', hasMany: true, label: 'Single books' },
  ],
}
