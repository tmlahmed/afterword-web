import path from 'path'
import { APIError, type GlobalConfig } from 'payload'

import { allow, anyone } from '../access/roles'
import { MEDIA_DIR } from '../collections/Media'
import { checkBanglaQr, readQrPicture } from '../lib/payments/banglaQr'

/** Exchange rates and margin used to turn a publisher's list price into a taka price. */
export const Pricing: GlobalConfig = {
  slug: 'pricing',
  label: 'Pricing rules',
  admin: {
    group: 'Settings',
    description:
      'Selling price = list price × your rate for that currency × margin, rounded up. Saving here does not change existing prices; books are re-priced when they are next saved.',
  },
  access: { read: allow('manager', 'catalogue'), update: allow('manager') },
  fields: [
    {
      name: 'rates',
      type: 'array',
      labels: { singular: 'Currency rate', plural: 'Currency rates' },
      admin: { description: 'The taka you actually pay for one unit of each currency.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'currency', type: 'select', required: true, options: ['GBP', 'USD', 'INR', 'EUR'] },
            { name: 'rate', type: 'number', required: true, min: 0, label: 'Taka per unit' },
          ],
        },
      ],
    },
    {
      name: 'defaultMargin',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 0,
      admin: { description: 'Multiplier applied after conversion. 1.2 adds 20%.' },
    },
    {
      name: 'roundTo',
      type: 'number',
      required: true,
      defaultValue: 10,
      min: 1,
      admin: { description: 'Prices round up to a multiple of this many taka.' },
    },
  ],
}

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Shop settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: allow('manager') },
  hooks: {
    // A new Bangla QR picture: read the code in it, so the shop can draw it in its own style.
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const idOf = (v: unknown) => (typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number | null | undefined))
        const picture = idOf(data.banglaQrImage)
        if (!picture) return { ...data, banglaQr: null }
        if (picture === idOf(originalDoc?.banglaQrImage) && data.banglaQr) return data
        const media = await req.payload.findByID({ collection: 'media', id: picture, depth: 0, req, overrideAccess: true })
        const text = media.filename ? await readQrPicture(path.join(MEDIA_DIR, media.filename)).catch(() => null) : null
        if (!text) throw new APIError('No QR code could be found in that picture. Upload a clear, straight picture of your Bangla QR.', 400, undefined, true)
        const qr = checkBanglaQr(text)
        if ('problem' in qr) throw new APIError(qr.problem, 400, undefined, true)
        return { ...data, banglaQr: qr.text }
      },
    ],
  },
  fields: [
    {
      name: 'announcement',
      type: 'text',
      defaultValue: 'Original editions only · Delivery across Bangladesh',
      admin: { description: 'The thin strip at the very top of every page.' },
    },
    {
      name: 'defaultLeadTimeWeeks',
      type: 'number',
      defaultValue: 4,
      min: 1,
      admin: { description: 'Weeks quoted for On Request books that have no lead time of their own.' },
    },
    {
      type: 'collapsible',
      label: 'Delivery, payment and order rules',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'insideDhakaFee', type: 'number', min: 0, defaultValue: 70, label: 'Delivery inside Dhaka (৳)' },
            { name: 'outsideDhakaFee', type: 'number', min: 0, defaultValue: 130, label: 'Delivery outside Dhaka (৳)' },
            {
              name: 'freeDeliveryAbove',
              type: 'number',
              min: 0,
              defaultValue: 3000,
              label: 'Free delivery above (৳)',
              admin: { description: '0 switches free delivery off.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'insideDhakaDays', type: 'text', defaultValue: '1–2 working days', label: 'Inside Dhaka takes' },
            { name: 'outsideDhakaDays', type: 'text', defaultValue: '3–5 working days', label: 'Outside Dhaka takes' },
            { name: 'giftWrapFee', type: 'number', min: 0, defaultValue: 80, label: 'Gift wrap (৳)' },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'advancePercent',
              type: 'number',
              min: 0,
              max: 100,
              defaultValue: 50,
              label: 'Advance for pre-orders and On Request (%)',
              admin: { description: 'Charged on those books only. Books in stock are always cash on delivery.' },
            },
            {
              name: 'codCeiling',
              type: 'number',
              min: 0,
              defaultValue: 5000,
              label: 'Cash on delivery needs an advance above (৳)',
              // No longer used: books in stock are always cash on delivery. Kept so no data is dropped.
              admin: { hidden: true },
            },
          ],
        },
        {
          name: 'bkashNumber',
          type: 'text',
          label: 'bKash number for manual payments',
          admin: {
            description:
              'Until the online gateway is connected, customers send advance payments to this number and tell us the number or account they paid from (the transaction ID is optional). Leave empty to hide the option.',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'banglaQrImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Bangla QR picture',
              admin: {
                description:
                  'Optional. A screenshot of your Bangla QR from the bKash app (My QR). Customers can then pay from bKash, Nagad, Rocket or any bank app. The shop redraws it in black and white to match the site.',
              },
            },
            {
              name: 'banglaQr',
              type: 'text',
              label: 'QR code read from the picture',
              admin: { readOnly: true, description: 'Filled in when you save. This is what payment apps read.' },
            },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Reward points',
      admin: {
        description:
          'Customers earn points when an order is delivered and spend them at checkout. One point is worth ৳1. Changes apply to orders placed from now on.',
      },
      fields: [
        { name: 'rewardsEnabled', type: 'checkbox', defaultValue: true, label: 'Reward points are switched on' },
        {
          type: 'row',
          fields: [
            { name: 'rewardsEarnPerHundred', type: 'number', min: 0, defaultValue: 1, label: 'Points earned per ৳100 of books' },
            { name: 'rewardsRedeemMinimum', type: 'number', min: 0, defaultValue: 100, label: 'Fewest points that can be spent' },
            { name: 'rewardsRedeemMaxPercent', type: 'number', min: 0, max: 100, defaultValue: 20, label: 'Points may pay up to (% of books)' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Messages to customers',
      admin: { description: 'Wording of each SMS. Use {name}, {number}, {total}, {link}, {courier} and {tracking}.' },
      fields: [
        { name: 'smsPlaced', type: 'textarea', defaultValue: 'AFTERWORD: thank you {name}. Order {number} for Tk{total} is received. Track it: {link}' },
        { name: 'smsConfirmed', type: 'textarea', defaultValue: 'AFTERWORD: order {number} is confirmed and being prepared. {link}' },
        { name: 'smsShipped', type: 'textarea', defaultValue: 'AFTERWORD: order {number} is on its way with {courier}, tracking {tracking}. {link}' },
        { name: 'smsArrived', type: 'textarea', defaultValue: 'AFTERWORD: good news {name}, the books for order {number} have arrived in Dhaka and are being packed. {link}' },
        { name: 'smsDelivered', type: 'textarea', defaultValue: 'AFTERWORD: order {number} has been delivered. Happy reading.' },
        { name: 'smsCancelled', type: 'textarea', defaultValue: 'AFTERWORD: order {number} has been cancelled. Questions? Reply to this message.' },
      ],
    },
    {
      name: 'dispatchPromise',
      type: 'text',
      defaultValue: 'Ships next working day from Dhaka',
      admin: { description: 'Shown beside books that are in stock.' },
    },
  ],
}

/** The home page: one featured book, then any number of shelves. */
export const Home: GlobalConfig = {
  slug: 'home',
  label: 'Home page',
  admin: { group: 'Content', description: 'Everything on the home page is arranged here.' },
  access: { read: anyone, update: allow('manager', 'catalogue', 'writer') },
  fields: [
    {
      name: 'feature',
      type: 'group',
      label: 'Featured book',
      fields: [
        { name: 'eyebrow', type: 'text', defaultValue: 'Book of the Month' },
        { name: 'edition', type: 'relationship', relationTo: 'editions', label: 'Book' },
        {
          name: 'note',
          type: 'relationship',
          relationTo: 'notes',
          // Only the notes written about the book chosen above.
          filterOptions: ({ siblingData }) => {
            const book = (siblingData as { edition?: number | { id: number } | null })?.edition
            const id = typeof book === 'object' && book ? book.id : book
            return id ? { edition: { equals: id } } : false
          },
          admin: {
            description: 'The bookseller note to quote beside the cover. Only notes about the book above are listed; choose the book first. To write one, add it under Content → Bookseller notes.',
          },
        },
      ],
    },
    {
      name: 'shelves',
      type: 'array',
      labels: { singular: 'Shelf', plural: 'Shelves' },
      admin: { description: 'Shelves appear in this order. A shelf with no books is hidden.' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'intro', type: 'text' },
        {
          type: 'row',
          fields: [
            {
              name: 'source',
              type: 'select',
              required: true,
              defaultValue: 'list',
              options: [
                { label: 'A collection', value: 'list' },
                { label: 'In stock now', value: 'in_stock' },
                { label: 'Pre-orders', value: 'pre_order' },
                { label: 'Newest additions', value: 'newest' },
              ],
            },
            {
              name: 'list',
              type: 'relationship',
              relationTo: 'lists',
              label: 'Collection',
              admin: { condition: (_, sibling) => sibling?.source === 'list' },
            },
            { name: 'limit', type: 'number', defaultValue: 12, min: 1, max: 24 },
          ],
        },
      ],
    },
    {
      name: 'quote',
      type: 'relationship',
      relationTo: 'notes',
      label: 'Pull-quote note',
      admin: { description: 'A second bookseller note, shown large between shelves.' },
    },
  ],
}

/** The main menu. Each item can open a panel of links with one featured book. */
export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Main menu',
  admin: { group: 'Content', description: 'The menu across the top of the shop, in this order.' },
  access: { read: anyone, update: allow('manager', 'writer', 'catalogue') },
  fields: [
    {
      name: 'items',
      type: 'array',
      labels: { singular: 'Menu item', plural: 'Menu items' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true },
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'subject',
              options: [
                { label: 'A subject', value: 'subject' },
                { label: 'A collection', value: 'list' },
                { label: 'A page or address', value: 'url' },
              ],
            },
          ],
        },
        {
          name: 'subject',
          type: 'relationship',
          relationTo: 'subjects',
          admin: {
            condition: (_, sibling) => sibling?.type === 'subject',
            description: 'The panel lists the subjects inside this one automatically.',
          },
        },
        {
          name: 'list',
          type: 'relationship',
          relationTo: 'lists',
          label: 'Collection',
          admin: { condition: (_, sibling) => sibling?.type === 'list' },
        },
        {
          name: 'url',
          type: 'text',
          label: 'Address',
          admin: { condition: (_, sibling) => sibling?.type === 'url', description: 'For example /marginalia or /collections.' },
        },
        {
          name: 'highlights',
          type: 'relationship',
          relationTo: 'lists',
          hasMany: true,
          label: 'Highlighted collections',
          admin: { description: 'Optional. Up to three collections shown in the panel beside the subjects.' },
        },
        {
          name: 'featured',
          type: 'relationship',
          relationTo: 'editions',
          label: 'Featured book',
          admin: { description: 'Optional. One cover shown in the panel.' },
        },
      ],
    },
  ],
}
