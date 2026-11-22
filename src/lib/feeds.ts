import type { Payload } from 'payload'

import type { Edition, Publisher, Subject } from '../payload-types'
import { availabilityOf } from './availability'
import { siteUrl } from './notify'
import { productHref } from './links'

/**
 * Product feeds: the catalogue in the formats Google Merchant Center and Meta (Facebook and
 * Instagram Shops) read. Both use the same RSS 2.0 layout with Google's g: fields; only the
 * availability words differ. Books without a price or a cover are left out, since both
 * services reject them.
 */
export type FeedFormat = 'google' | 'meta'

const AVAILABILITY: Record<FeedFormat, Record<string, string>> = {
  google: { in_stock: 'in_stock', pre_order: 'preorder', on_request: 'backorder', unavailable: 'out_of_stock' },
  meta: { in_stock: 'in stock', pre_order: 'preorder', on_request: 'available for order', unavailable: 'out of stock' },
}

const xml = (value: unknown) =>
  String(value ?? '')
    // Characters XML 1.0 does not allow at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const tag = (name: string, value: unknown) => (value === undefined || value === null || value === '' ? '' : `<${name}>${xml(value)}</${name}>`)

export const buildFeed = async (payload: Payload, format: FeedFormat, now = new Date()): Promise<{ xml: string; count: number }> => {
  const site = siteUrl()
  const [settings, books] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings' }),
    payload.find({
      collection: 'editions',
      where: { and: [{ status: { equals: 'published' } }, { price: { greater_than: 0 } }, { coverUrl: { exists: true } }, { sourcing: { not_equals: 'out_of_print' } }] },
      select: {
        title: true, subtitle: true, slug: true, isbn13: true, authorLine: true, synopsis: true, coverUrl: true, price: true,
        compareAtPrice: true, sourcing: true, stockOnHand: true, expectedDate: true, leadTimeWeeks: true, publisher: true,
        subjects: true, format: true, pages: true, language: true, kind: true, itemType: true, sku: true,
      },
      depth: 1,
      pagination: false,
      overrideAccess: true,
    }),
  ])

  const items: string[] = []
  for (const book of books.docs as Edition[]) {
    if (!book.coverUrl) continue
    const state = availabilityOf(book, settings).state
    const publisher = typeof book.publisher === 'object' ? (book.publisher as Publisher | null)?.name : undefined
    const subject = (book.subjects ?? []).find((s): s is Subject => typeof s === 'object')?.name
    const link = `${site}${productHref(book)}`
    // Gifts and stationery have no ISBN: they go in as AFTERWORD products, with no barcode.
    const isItem = book.kind === 'item' || !book.isbn13
    const feedId = isItem ? (book.sku || `item-${book.id}`) : book.isbn13!
    const image = `${site}/feeds/cover/${isItem ? `item-${book.id}` : book.isbn13}.jpg`
    const title = (isItem ? book.title : [book.title, book.authorLine ? `by ${book.authorLine}` : '', book.format === 'hardback' ? '(Hardback)' : ''].filter(Boolean).join(' ')).slice(0, 150)
    const description = (
      book.synopsis ||
      (isItem ? `${book.title} from AFTERWORD.` : `${book.title}${book.authorLine ? ` by ${book.authorLine}` : ''}. Original publisher’s edition from AFTERWORD.`)
    ).slice(0, 4900)
    // When a pre-order or ordered-in book is expected, which both services ask for.
    const weeks = book.leadTimeWeeks || settings.defaultLeadTimeWeeks || 4
    const arrives =
      state === 'pre_order' && book.expectedDate
        ? new Date(book.expectedDate)
        : state === 'on_request'
          ? new Date(now.getTime() + weeks * 7 * 86400_000)
          : null
    const onSale = book.compareAtPrice && book.compareAtPrice > (book.price ?? 0)

    items.push(
      [
        '<item>',
        tag('g:id', feedId),
        tag('g:title', title),
        tag('g:description', description),
        tag('g:link', link),
        tag('g:image_link', image),
        tag('g:availability', AVAILABILITY[format][state]),
        arrives ? tag('g:availability_date', arrives.toISOString().slice(0, 19) + '+06:00') : '',
        tag('g:price', `${(onSale ? book.compareAtPrice! : book.price!).toFixed(2)} BDT`),
        onSale ? tag('g:sale_price', `${book.price!.toFixed(2)} BDT`) : '',
        tag('g:condition', 'new'),
        tag('g:brand', isItem ? 'AFTERWORD' : publisher || book.authorLine || 'AFTERWORD'),
        isItem ? '' : tag('g:gtin', book.isbn13!),
        tag('g:identifier_exists', isItem ? 'no' : 'yes'),
        // Media > Books, or Office Supplies > General Office Supplies for stationery and gifts.
        tag('g:google_product_category', isItem ? '932' : '784'),
        tag('g:product_type', isItem ? `Gifts & Stationery${subject ? ` > ${subject}` : ''}` : subject ? `Books > ${subject}` : 'Books'),
        tag('g:custom_label_0', state),
        '</item>',
      ].join(''),
    )
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    tag('title', 'AFTERWORD'),
    tag('link', site),
    tag('description', 'Original publishers’ editions, delivered across Bangladesh.'),
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n')
  return { xml: body, count: items.length }
}
