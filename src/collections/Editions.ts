import type { CollectionConfig, FieldAccess } from 'payload'
import type { Edition } from '../payload-types'

import { allow, allowField, publishedOrStaff } from '../access/roles'
import { importIsbnEndpoint } from '../endpoints/importIsbn'
import { normaliseIsbn } from '../lib/isbn/isbn'
import { activeGroupDiscounts, groupDiscountFor, pricesFor } from '../lib/repricing'
import { removeBook, syncBook } from '../lib/search'
import { ITEM_TYPES } from '../lib/itemTypes'
import { slugify } from '../lib/slug'

export const CONTRIBUTOR_ROLES = [
  { label: 'Author', value: 'author' },
  { label: 'Translator', value: 'translator' },
  { label: 'Illustrator', value: 'illustrator' },
  { label: 'Editor', value: 'editor' },
  { label: 'Introduction by', value: 'introduction' },
] as const

export const FORMATS = [
  { label: 'Paperback', value: 'paperback' },
  { label: 'Hardback', value: 'hardback' },
  { label: 'Special edition', value: 'special' },
  { label: 'Box set', value: 'boxset' },
  { label: 'Board book', value: 'board' },
] as const

export { ITEM_TYPES }

type KindData = { kind?: string | null } | undefined
/** Shown only for books (hidden for gifts and stationery). */
const forBooks = (data: KindData) => data?.kind !== 'item'
/** Shown only for gifts and stationery. */
const forItems = (data: KindData) => data?.kind === 'item'

/** What a book costs us and where it comes from is for staff only. */
const staffOnly: FieldAccess = ({ req }) => Boolean(req.user)

/**
 * An edition is one ISBN: the thing a customer buys and the thing with its own page.
 * Editions of the same book share a Work.
 */
export const Editions: CollectionConfig = {
  slug: 'editions',
  labels: { singular: 'Book or item', plural: 'Books' },
  admin: {
    useAsTitle: 'title',
    group: 'Catalogue',
    defaultColumns: ['title', 'authorLine', 'format', 'price', 'stockOnHand', 'status'],
    listSearchableFields: ['title', 'isbn13', 'authorLine'],
    description: 'Books (one edition each, identified by its ISBN) and gifts and stationery. To add books by ISBN, from a spreadsheet or by hand, or to add a gift or stationery item, press Create new.',
  },
  access: {
    read: publishedOrStaff,
    create: allow('manager', 'catalogue'),
    update: allow('manager', 'catalogue'),
    delete: allow('manager'),
  },
  endpoints: [importIsbnEndpoint],
  hooks: {
    // Keep the search index in step with the catalogue. Runs after the save has finished,
    // and never blocks or fails it.
    afterChange: [
      ({ doc, req, context }) => {
        // A short pause lets the save finish before the index reads the book back.
        if (!context?.skipSearchSync) setTimeout(() => void syncBook(req.payload, doc.id), 600)
        return doc
      },
      // The Afterword chosen here is ticked on the note itself (which unticks the book's others).
      async ({ doc, previousDoc, req, context }) => {
        if (context?.fromNote) return doc
        const idOf = (v: unknown) => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number | null | undefined)) ?? null
        const now = idOf(doc.afterwordNote)
        const before = idOf(previousDoc?.afterwordNote)
        if (now === before) return doc
        if (now) {
          await req.payload.update({ collection: 'notes', id: now, data: { chosen: true }, depth: 0, req, overrideAccess: true, context: { fromEdition: true } })
        } else if (before) {
          // The note may have been deleted since; then there is nothing to untick.
          await req.payload.update({ collection: 'notes', id: before, data: { chosen: false }, depth: 0, req, overrideAccess: true, context: { fromEdition: true } }).catch(() => undefined)
        }
        return doc
      },
    ],
    afterDelete: [
      ({ id, req }) => {
        void removeBook(req.payload, Number(id))
      },
    ],
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (data.isbn13) data.isbn13 = normaliseIsbn(String(data.isbn13)) ?? data.isbn13
        if (!data.slug && data.title && data.isbn13) {
          data.slug = `${slugify(String(data.title))}-${data.isbn13}`
        }
        // Gifts and stationery have no ISBN: their stock code, or a short random tail, keeps the address unique.
        if (!data.slug && data.title && data.kind === 'item') {
          const tail = data.sku ? slugify(String(data.sku)) : Math.random().toString(36).slice(2, 7)
          data.slug = `${slugify(String(data.title))}-${tail}`
        }
        return data
      },
    ],
    beforeChange: [
      // The shop shows the uploaded cover once there is one.
      async ({ data, req, originalDoc }) => {
        const cover = typeof data.cover === 'object' && data.cover ? data.cover.id : data.cover
        const before = typeof originalDoc?.cover === 'object' && originalDoc?.cover ? originalDoc.cover.id : originalDoc?.cover
        // Looked up on every save, not only when a different upload is chosen: the file inside an
        // upload can be replaced, and the book must follow it.
        if (cover) {
          const media = await req.payload.findByID({ collection: 'media', id: cover, depth: 0, req, disableErrors: true })
          // Stored as a path, so it works on any address the shop is served from.
          if (media?.filename) data.coverUrl = `/api/media/file/${encodeURIComponent(media.filename)}`
        } else if (!cover && before) {
          data.coverUrl = data.coverSource ?? originalDoc?.coverSource ?? null
        }
        return data
      },
      // Prices: the listed price comes from the printed price and the pricing rules; customers
      // pay it less the book's discount (or the shop's, or a running group discount, whichever
      // is bigger). A fixed selling price set by staff wins over all of that.
      async ({ data, req, originalDoc }) => {
        const pick = <K extends keyof Edition>(key: K) => (data[key] !== undefined ? data[key] : originalDoc?.[key]) as Edition[K]
        const [pricing, rules] = await Promise.all([req.payload.findGlobal({ slug: 'pricing', req, depth: 0, overrideAccess: true }), activeGroupDiscounts(req.payload, req)])
        const sale = groupDiscountFor({ id: originalDoc?.id, subjects: pick('subjects'), publisher: pick('publisher') }, rules)
        const next = pricesFor(
          { kind: pick('kind'), listPrice: pick('listPrice'), listCurrency: pick('listCurrency'), priceOverride: pick('priceOverride'), discount: pick('discount'), price: pick('price') },
          pricing,
          sale,
        )
        Object.assign(data, next)
        return data
      },
      // A plain-text author line for lists, search and cards.
      async ({ data, req }) => {
        const authorIds = (data.contributors ?? [])
          .filter((c: { role?: string }) => c.role === 'author')
          .map((c: { contributor?: number | { id: number } }) =>
            typeof c.contributor === 'object' ? c.contributor?.id : c.contributor,
          )
          .filter(Boolean)
        if (authorIds.length === 0) return data
        const found = await req.payload.find({
          collection: 'contributors',
          where: { id: { in: authorIds } },
          depth: 0,
          limit: authorIds.length,
          req,
        })
        const names = authorIds
          .map((id: number) => found.docs.find((d) => d.id === id)?.name)
          .filter(Boolean)
        if (names.length) data.authorLine = names.join(', ')
        return data
      },
    ],
  },
  fields: [
    // On a new book's page: add it by ISBN, or import a spreadsheet, before filling the form by hand.
    { name: 'quickAdd', type: 'ui', admin: { components: { Field: '/components/admin/QuickAdd#QuickAdd' } } },
    {
      name: 'kind',
      type: 'radio',
      required: true,
      defaultValue: 'book',
      index: true,
      label: 'This is a',
      options: [
        { label: 'Book', value: 'book' },
        { label: 'Gift or stationery', value: 'item' },
      ],
      admin: {
        layout: 'horizontal',
        // Drawn as two large choice cards (custom.scss): it decides which fields the page shows.
        className: 'aw-kind',
        description: 'Gifts and stationery need no ISBN or author, so the book-only fields are hidden for them.',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            { name: 'title', type: 'text', required: true, index: true },
            { name: 'subtitle', type: 'text' },
            {
              name: 'contributors',
              type: 'array',
              labels: { singular: 'Contributor', plural: 'Contributors' },
              admin: { description: 'Authors first, then translators, illustrators and editors.', condition: forBooks },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'contributor',
                      type: 'relationship',
                      relationTo: 'contributors',
                      required: true,
                    },
                    {
                      name: 'role',
                      type: 'select',
                      required: true,
                      defaultValue: 'author',
                      options: [...CONTRIBUTOR_ROLES],
                    },
                  ],
                },
              ],
            },
            {
              name: 'synopsis',
              type: 'textarea',
              label: 'Description',
              admin: { description: 'For a book, the publisher’s description; for an item, what it is, its size and material. Plain paragraphs.' },
            },
            {
              name: 'cover',
              type: 'upload',
              relationTo: 'media',
              label: 'Cover or main photo',
              admin: { description: 'For a book, upload a cover to replace the imported one. For an item, its main photo.' },
            },
            {
              name: 'coverUrl',
              type: 'text',
              admin: {
                readOnly: true,
                description: 'The cover the shop shows. Set from the uploaded cover; until one is copied in, the imported one.',
              },
            },
            {
              name: 'coverSource',
              type: 'text',
              access: { read: staffOnly },
              admin: { readOnly: true, description: 'Where the imported cover came from.' },
            },
            {
              name: 'photos',
              type: 'array',
              label: 'More photos',
              labels: { singular: 'Photo', plural: 'Photos' },
              maxRows: 12,
              admin: {
                description:
                  'Optional. The back cover, the spine, inside pages, the edition in hand. Shown after the cover on the book’s page, in this order (drag to reorder).',
                initCollapsed: true,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'image', type: 'upload', relationTo: 'media', required: true },
                    { name: 'caption', type: 'text', admin: { description: 'Optional, e.g. “Back cover” or “First page”.' } },
                  ],
                },
              ],
            },
            { name: 'subjects', type: 'relationship', relationTo: 'subjects', hasMany: true },
            { name: 'work', type: 'relationship', relationTo: 'works', admin: { condition: forBooks } },
            {
              type: 'row',
              admin: { condition: forBooks },
              fields: [
                { name: 'series', type: 'relationship', relationTo: 'series' },
                { name: 'seriesNumber', type: 'number', min: 0 },
              ],
            },
          ],
        },
        {
          label: 'Edition details',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'format',
                  type: 'select',
                  defaultValue: 'paperback',
                  options: [...FORMATS],
                  // Required for books only.
                  validate: (value: unknown, { siblingData, data }: { siblingData?: KindData; data?: KindData }) =>
                    (data ?? siblingData)?.kind === 'item' || value ? true : 'Choose the format.',
                  admin: { condition: forBooks },
                },
                { name: 'publisher', type: 'relationship', relationTo: 'publishers', admin: { condition: forBooks } },
                {
                  name: 'itemType',
                  type: 'select',
                  label: 'Type of item',
                  options: [...ITEM_TYPES],
                  validate: (value: unknown, { data }: { data?: KindData }) => (data?.kind !== 'item' || value ? true : 'Choose what kind of item this is.'),
                  admin: { condition: forItems },
                },
                {
                  name: 'sku',
                  type: 'text',
                  label: 'Stock code (optional)',
                  admin: { condition: forItems, description: 'Your own code for it, e.g. BM-RED-01.' },
                },
              ],
            },
            {
              type: 'row',
              admin: { condition: forBooks },
              fields: [
                {
                  name: 'publicationDate',
                  type: 'date',
                  admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' } },
                },
                { name: 'language', type: 'text', defaultValue: 'English' },
                { name: 'pages', type: 'number', min: 0 },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'heightMm', type: 'number', min: 0, label: 'Height (mm)' },
                { name: 'widthMm', type: 'number', min: 0, label: 'Width (mm)' },
                { name: 'spineMm', type: 'number', min: 0, label: 'Spine or depth (mm)' },
                { name: 'weightG', type: 'number', min: 0, label: 'Weight (g)' },
              ],
            },
          ],
        },
        {
          label: 'Price and availability',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'listPrice',
                  type: 'number',
                  min: 0,
                  label: 'Printed price',
                  access: { read: staffOnly },
                  admin: { description: 'As printed on the book, e.g. 599. While copies are in stock it follows the oldest delivery.' },
                },
                {
                  name: 'listCurrency',
                  type: 'select',
                  label: 'Currency',
                  access: { read: staffOnly },
                  options: ['GBP', 'USD', 'INR', 'EUR', 'BDT'],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'originalPrice',
                  type: 'number',
                  access: { read: staffOnly },
                  label: 'Listed price (৳)',
                  admin: {
                    readOnly: true,
                    description: 'Printed price × taka per unit (Settings → Pricing rules), rounded. Updated when you save.',
                  },
                },
                {
                  name: 'discount',
                  type: 'number',
                  min: 0,
                  max: 100,
                  label: 'Discount (%)',
                  admin: {
                    description: 'Leave empty for the shop discount. 0 sells at the listed price.',
                  },
                  access: { read: staffOnly, update: allowField('manager', 'catalogue') },
                },
                {
                  name: 'priceOverride',
                  type: 'number',
                  min: 0,
                  label: 'Fixed price (৳)',
                  admin: {
                    description: 'Optional. A set price instead of the discount, e.g. 899.',
                  },
                  access: { read: staffOnly, update: allowField('manager', 'catalogue') },
                },
              ],
            },
            { name: 'pricePreview', type: 'ui', admin: { components: { Field: '/components/admin/PricePreview#PricePreview' } } },
            {
              type: 'row',
              admin: { condition: () => false },
              fields: [
                // Worked out on save from the two fields above; what the shop shows and charges.
                { name: 'price', type: 'number', min: 0, label: 'Customers pay (৳)' },
                { name: 'compareAtPrice', type: 'number', min: 0, label: 'Shown struck through (৳)' },
                // A group discount running now (Sell → Group discounts), kept up to date on its own.
                { name: 'saleDiscount', type: 'number', min: 0, max: 100, label: 'Group discount now (%)', access: { read: staffOnly } },
              ],
            },
            {
              name: 'sourcing',
              type: 'select',
              required: true,
              defaultValue: 'standard',
              options: [
                {
                  label: 'Standard — "In stock" when copies are on hand, otherwise "On Request"',
                  value: 'standard',
                },
                { label: 'Pre-order — not yet published or not yet arrived', value: 'pre_order' },
                { label: 'Out of print — cannot be supplied', value: 'out_of_print' },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'expectedDate',
                  type: 'date',
                  label: 'Expected in Dhaka',
                  admin: {
                    condition: (data) => data?.sourcing === 'pre_order',
                    date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
                  },
                },
                {
                  name: 'leadTimeWeeks',
                  type: 'number',
                  min: 0,
                  label: 'On Request lead time (weeks)',
                  admin: {
                    condition: (data) => data?.sourcing === 'standard',
                    description: 'Leave empty to use the shop default.',
                  },
                },
              ],
            },
            {
              name: 'supplier',
              type: 'relationship',
              relationTo: 'suppliers',
              access: { read: staffOnly },
            },
          ],
        },
      ],
    },
    {
      name: 'isbn13',
      type: 'text',
      label: 'ISBN',
      unique: true,
      index: true,
      // Every book has one; gifts and stationery do not.
      validate: (value: unknown, { data }: { data?: KindData }) => (data?.kind === 'item' || value ? true : 'Enter the ISBN.'),
      admin: { position: 'sidebar', condition: forBooks },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft — hidden from the shop', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'stockOnHand',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Copies in Dhaka. Changes only through stock movements.',
      },
    },
    {
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'ratingAverage', type: 'number', label: 'Average rating', admin: { readOnly: true } },
        { name: 'ratingCount', type: 'number', defaultValue: 0, label: 'Reviews', admin: { readOnly: true } },
      ],
    },
    {
      name: 'authorLine',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      required: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'importSource',
      type: 'text',
      access: { read: staffOnly },
      admin: { position: 'sidebar', readOnly: true, description: 'Where the book data came from.' },
    },
    {
      name: 'afterwordNote',
      type: 'relationship',
      relationTo: 'notes',
      label: 'The Afterword shown for this book',
      // Only this book's own notes can be chosen.
      filterOptions: ({ id }) => (id ? { edition: { equals: id } } : false),
      admin: {
        description:
          'Which bookseller note appears on the book’s page. Only this book’s notes are listed. Leave empty to show the most recently edited note. The same choice can be made on the note itself (“Show this one as The Afterword”).',
      },
    },
    { name: 'notes', type: 'join', collection: 'notes', on: 'edition', label: 'All bookseller notes for this book' },
    { name: 'stockMovements', type: 'join', collection: 'stock-movements', on: 'edition', access: { read: staffOnly } },
  ],
}
