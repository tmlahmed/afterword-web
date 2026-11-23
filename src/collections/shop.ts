import type { CollectionConfig } from 'payload'

import type { Edition } from '../payload-types'

import { allow, anyone, nobody } from '../access/roles'
import { lotsForMovement, nextLotPrice } from '../lib/lots'
import { allocateWaitingOrders } from '../lib/orders/transitions'
import { slugify } from '../lib/slug'

/** "The Afterword": a short bookseller's note on a book, signed by name. */
export const Notes: CollectionConfig = {
  slug: 'notes',
  labels: { singular: 'Bookseller note', plural: 'Bookseller notes' },
  admin: {
    // Listed as "Book title — Bookseller" so a note is never confused with another book's.
    useAsTitle: 'label',
    group: 'Content',
    defaultColumns: ['label', 'edition', 'signedBy', 'chosen', 'updatedAt'],
    listSearchableFields: ['label', 'signedBy'],
    description: 'The Afterword — two to four sentences on why this book, signed by a bookseller.',
  },
  access: {
    read: anyone,
    create: allow('manager', 'catalogue', 'writer'),
    update: allow('manager', 'catalogue', 'writer'),
    delete: allow('manager', 'writer'),
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        const edition = data.edition ?? originalDoc?.edition
        const editionId = typeof edition === 'object' && edition ? edition.id : edition
        const book = editionId
          ? await req.payload.findByID({ collection: 'editions', id: editionId, depth: 0, select: { title: true }, req, disableErrors: true })
          : null
        const signedBy = data.signedBy ?? originalDoc?.signedBy ?? ''
        data.label = [book?.title, signedBy].filter(Boolean).join(' — ')
        return data
      },
    ],
    // Only one note per book can be the chosen one: choosing this one unticks the others.
    afterChange: [
      async ({ doc, previousDoc, req, context }) => {
        if (context.unchoosing) return doc
        const editionId = typeof doc.edition === 'object' && doc.edition ? doc.edition.id : doc.edition
        // Keep the book's own "The Afterword shown" field in step with this box.
        if (!context.fromEdition && editionId && Boolean(doc.chosen) !== Boolean(previousDoc?.chosen)) {
          const book = await req.payload.findByID({ collection: 'editions', id: editionId, depth: 0, req, overrideAccess: true, disableErrors: true, select: { afterwordNote: true } })
          const current = book ? (typeof book.afterwordNote === 'object' && book.afterwordNote ? book.afterwordNote.id : book.afterwordNote) : null
          const wanted = doc.chosen ? doc.id : current === doc.id ? null : current
          if (book && wanted !== current) {
            await req.payload.update({ collection: 'editions', id: editionId, data: { afterwordNote: wanted }, depth: 0, req, overrideAccess: true, context: { fromNote: true, skipSearchSync: true } })
          }
        }
        if (!doc.chosen) return doc
        await req.payload.update({
          collection: 'notes',
          where: { and: [{ edition: { equals: editionId } }, { id: { not_equals: doc.id } }, { chosen: { equals: true } }] },
          data: { chosen: false },
          depth: 0,
          req,
          overrideAccess: true,
          context: { unchoosing: true },
        })
        return doc
      },
    ],
  },
  fields: [
    { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, index: true },
    { name: 'body', type: 'textarea', required: true, maxLength: 700 },
    { name: 'signedBy', type: 'text', required: true, admin: { description: 'The bookseller’s name.' } },
    {
      name: 'chosen',
      type: 'checkbox',
      defaultValue: false,
      label: 'Show this one as The Afterword',
      admin: {
        description:
          'Only matters when a book has more than one note. Ticking it here unticks the book’s other notes. If none is ticked, the most recently edited note is shown.',
      },
    },
    { name: 'label', type: 'text', index: true, admin: { hidden: true } },
  ],
}

/** A curated list of books with an introduction: monthly picks, prize lists, themes, gift guides. */
export const Lists: CollectionConfig = {
  slug: 'lists',
  labels: { singular: 'Collection', plural: 'Collections' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'kind', 'updatedAt'],
    description: 'Hand-picked shelves. Drag the books into the order they should appear.',
  },
  access: {
    read: anyone,
    create: allow('manager', 'catalogue', 'writer'),
    update: allow('manager', 'catalogue', 'writer'),
    delete: allow('manager'),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      required: true,
      admin: { position: 'sidebar' },
      hooks: {
        beforeValidate: [
          ({ value, data }) => slugify(String(value || data?.title || '')),
        ],
      },
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'theme',
      options: [
        { label: 'Theme', value: 'theme' },
        { label: 'Monthly picks', value: 'monthly' },
        { label: 'Prize list', value: 'prize' },
        { label: 'Gift guide', value: 'gift' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'intro', type: 'textarea', admin: { description: 'One or two sentences shown above the books.' } },
    { name: 'books', type: 'relationship', relationTo: 'editions', hasMany: true },
  ],
}

export const STOCK_REASONS = [
  { label: 'Opening stock', value: 'opening' },
  { label: 'Received from supplier', value: 'received' },
  { label: 'Sold', value: 'sale' },
  { label: 'Order cancelled — copies released', value: 'released' },
  { label: 'Customer return', value: 'return' },
  { label: 'Damaged or lost', value: 'damaged' },
  { label: 'Stock count correction', value: 'adjustment' },
] as const

/**
 * The stock ledger. Copies on hand for a book is the sum of its movements;
 * nobody types over a stock number. Movements are never edited or deleted —
 * a mistake is corrected with a second movement.
 */
export const StockMovements: CollectionConfig = {
  slug: 'stock-movements',
  labels: { singular: 'Stock movement', plural: 'Stock movements' },
  admin: {
    group: 'Stock and purchasing',
    defaultColumns: ['edition', 'quantity', 'reason', 'createdAt'],
    description:
      'Every change to stock, with a reason. To fix a mistake, add another movement — entries cannot be edited.',
  },
  access: {
    read: allow('manager', 'catalogue', 'warehouse', 'orders'),
    create: allow('manager', 'warehouse'),
    update: nobody,
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data
        if (req.user) data.recordedBy = req.user.id
        data.lots = await lotsForMovement(req, data)
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        const editionId = typeof doc.edition === 'object' ? doc.edition.id : doc.edition
        const movements = await req.payload.find({
          collection: 'stock-movements',
          where: { edition: { equals: editionId } },
          depth: 0,
          pagination: false,
          req,
        })
        const onHand = movements.docs.reduce((sum, m) => sum + (m.quantity ?? 0), 0)
        // The shop's price follows the copies that go out next: when the oldest lot runs out
        // and the next has a different printed price, the book is re-priced from it.
        const [book, next] = await Promise.all([
          req.payload.findByID({ collection: 'editions', id: editionId, depth: 0, req, overrideAccess: true, select: { listPrice: true, listCurrency: true } }),
          nextLotPrice(req.payload, editionId, req),
        ])
        const printed = next && (next.listPrice !== book.listPrice || next.listCurrency !== book.listCurrency) ? { listPrice: next.listPrice, listCurrency: next.listCurrency as Edition['listCurrency'] } : {}
        await req.payload.update({
          collection: 'editions',
          id: editionId,
          data: { stockOnHand: onHand, ...printed },
          depth: 0,
          req,
        })
        // Copies coming in go first to confirmed orders that are waiting for this book.
        // Runs after this save has finished, so it sees the new stock figure.
        if ((doc.quantity ?? 0) > 0) {
          setTimeout(() => {
            allocateWaitingOrders(req.payload, editionId).catch((err) =>
              req.payload.logger.error(`Could not release waiting orders: ${err instanceof Error ? err.message : err}`),
            )
          }, 400)
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'edition', type: 'relationship', relationTo: 'editions', required: true, index: true, label: 'Book' },
    {
      name: 'quantity',
      type: 'number',
      required: true,
      admin: { description: 'Copies added (positive) or removed (negative).' },
      validate: (value: number | null | undefined) =>
        Number.isInteger(value) && value !== 0 ? true : 'Enter a whole number other than zero.',
    },
    { name: 'reason', type: 'select', required: true, options: [...STOCK_REASONS] },
    { name: 'note', type: 'text' },
    { name: 'order', type: 'relationship', relationTo: 'orders', index: true, admin: { readOnly: true, position: 'sidebar', description: 'The order these copies went to or came back from.' } },
    {
      name: 'lots',
      type: 'json',
      label: 'From or into lots',
      admin: { readOnly: true, description: 'Which deliveries (lots) the copies came from or went back to, and what each cost.' },
    },
    {
      name: 'recordedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}

/** Searches that found nothing; see lib/searchMisses.ts. */
export const SearchMisses: CollectionConfig = {
  slug: 'search-misses',
  labels: { singular: 'Search with no results', plural: 'Searches with no results' },
  admin: {
    useAsTitle: 'query',
    group: 'Catalogue',
    defaultColumns: ['query', 'count', 'lastAt'],
    description: 'What customers searched for and did not find. A guide to what to stock next.',
  },
  defaultSort: '-count',
  access: { read: allow('manager', 'catalogue'), create: nobody, update: nobody, delete: allow('manager', 'catalogue') },
  fields: [
    { name: 'query', type: 'text', required: true, unique: true, index: true },
    { name: 'count', type: 'number', defaultValue: 1, index: true },
    { name: 'lastAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
