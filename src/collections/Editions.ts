import type { CollectionConfig, FieldAccess } from 'payload'

import { allow, allowField, publishedOrStaff } from '../access/roles'
import { importIsbnEndpoint } from '../endpoints/importIsbn'
import { normaliseIsbn } from '../lib/isbn/isbn'
import { computePrice } from '../lib/pricing'
import { removeBook, syncBook } from '../lib/search'
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

/** What a book costs us and where it comes from is for staff only. */
const staffOnly: FieldAccess = ({ req }) => Boolean(req.user)

/**
 * An edition is one ISBN: the thing a customer buys and the thing with its own page.
 * Editions of the same book share a Work.
 */
export const Editions: CollectionConfig = {
  slug: 'editions',
  labels: { singular: 'Book', plural: 'Books' },
  admin: {
    useAsTitle: 'title',
    group: 'Catalogue',
    defaultColumns: ['title', 'authorLine', 'format', 'price', 'stockOnHand', 'status'],
    listSearchableFields: ['title', 'isbn13', 'authorLine'],
    description: 'Each book is one edition, identified by its ISBN.',
    components: {
      beforeListTable: ['/components/admin/ImportIsbn#ImportIsbn', '/components/admin/CatalogueImport#CatalogueImport'],
    },
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
        return data
      },
    ],
    beforeChange: [
      // The shop shows the uploaded cover once there is one.
      async ({ data, req, originalDoc }) => {
        const cover = typeof data.cover === 'object' && data.cover ? data.cover.id : data.cover
        const before = typeof originalDoc?.cover === 'object' && originalDoc?.cover ? originalDoc.cover.id : originalDoc?.cover
        if (cover && cover !== before) {
          const media = await req.payload.findByID({ collection: 'media', id: cover, depth: 0, req, disableErrors: true })
          // Stored as a path, so it works on any address the shop is served from.
          if (media?.filename) data.coverUrl = `/api/media/file/${encodeURIComponent(media.filename)}`
        } else if (!cover && before) {
          data.coverUrl = data.coverSource ?? originalDoc?.coverSource ?? null
        }
        return data
      },
      // Selling price: a manual price always wins; otherwise it is calculated from the list price.
      async ({ data, req }) => {
        if (typeof data.priceOverride === 'number' && data.priceOverride > 0) {
          data.price = data.priceOverride
          return data
        }
        const pricing = await req.payload.findGlobal({ slug: 'pricing', req })
        const computed = computePrice(data.listPrice, data.listCurrency, {
          rates: (pricing.rates ?? []).map((r) => ({ currency: r.currency, rate: r.rate })),
          margin: pricing.defaultMargin ?? 1,
          roundTo: pricing.roundTo ?? 10,
        })
        if (computed !== null) data.price = computed
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
    {
      type: 'tabs',
      tabs: [
        {
          label: 'The book',
          fields: [
            { name: 'title', type: 'text', required: true, index: true },
            { name: 'subtitle', type: 'text' },
            {
              name: 'contributors',
              type: 'array',
              labels: { singular: 'Contributor', plural: 'Contributors' },
              admin: { description: 'Authors first, then translators, illustrators and editors.' },
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
              admin: { description: 'The publisher’s description. Plain paragraphs.' },
            },
            {
              name: 'cover',
              type: 'upload',
              relationTo: 'media',
              admin: { description: 'Upload a cover to replace the imported one.' },
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
            { name: 'subjects', type: 'relationship', relationTo: 'subjects', hasMany: true },
            { name: 'work', type: 'relationship', relationTo: 'works' },
            {
              type: 'row',
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
                  required: true,
                  defaultValue: 'paperback',
                  options: [...FORMATS],
                },
                { name: 'publisher', type: 'relationship', relationTo: 'publishers' },
              ],
            },
            {
              type: 'row',
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
                { name: 'spineMm', type: 'number', min: 0, label: 'Spine (mm)' },
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
                  access: { read: staffOnly },
                  admin: { description: 'The publisher’s printed price.' },
                },
                {
                  name: 'listCurrency',
                  type: 'select',
                  access: { read: staffOnly },
                  options: ['GBP', 'USD', 'INR', 'EUR', 'BDT'],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'price',
                  type: 'number',
                  min: 0,
                  label: 'Selling price (৳)',
                  admin: {
                    readOnly: true,
                    description: 'Calculated from the list price and your pricing rules.',
                  },
                },
                {
                  name: 'priceOverride',
                  type: 'number',
                  min: 0,
                  label: 'Manual price (৳)',
                  admin: { description: 'Optional. If set, this is the price charged.' },
                  access: { read: staffOnly, update: allowField('manager', 'catalogue') },
                },
                {
                  name: 'compareAtPrice',
                  type: 'number',
                  min: 0,
                  label: 'Was price (৳)',
                  admin: { description: 'Optional. Shown struck through beside the price.' },
                },
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
      required: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar' },
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
    { name: 'notes', type: 'join', collection: 'notes', on: 'edition' },
    { name: 'stockMovements', type: 'join', collection: 'stock-movements', on: 'edition', access: { read: staffOnly } },
  ],
}
