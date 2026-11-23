import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import React from 'react'

import { AvailabilityMark, Cover, Price, Shelf, tintFor } from './Books'
import { BookGallery, Expandable, type GalleryPhoto, StickyBuyBar } from './BookParts'
import { AddToBag } from './Forms'
import { type FormatOption, FormatPicker } from './FormatPicker'
import { ShelfButton } from './TheShelf'
import { type Availability, availabilityOf } from '../../lib/availability'
import { getBookBySlug, getEditionsOf, getNoteFor, getRelated, getSettings } from '../../lib/catalogue'
import type { Contributor, Edition, Media, Publisher, Series, Subject } from '../../payload-types'
import { siteUrl } from '../../lib/notify'
import { robotsFor, SHARE_DEFAULTS } from '../../lib/seo'
import { JsonLd } from './JsonLd'
import { ReaderReviews, REVIEWS_ON_BOOK_PAGE, reviewTotals } from './Reviews'
import { ratingCounts, reviewEligibility, reviewPage } from '../../lib/reviews'
import { ITEM_TYPE_LABEL } from '../../lib/itemTypes'
import { productHref } from '../../lib/links'
import { formatTaka } from '../../lib/pricing'
import { getCustomer } from '../../lib/session'
import config from '@payload-config'
import { getPayload } from 'payload'

/** Which address the page was opened at; the other kind is sent to its own address. */
export type ProductRoute = 'book' | 'item'

const ROLE_LABEL: Record<string, string> = {
  translator: 'Translated by',
  illustrator: 'Illustrated by',
  editor: 'Edited by',
  introduction: 'Introduction by',
}
const FORMAT_LABEL: Record<string, string> = {
  paperback: 'Paperback',
  hardback: 'Hardback',
  special: 'Special edition',
  boxset: 'Box set',
  board: 'Board book',
}

const contributorsOf = (book: Edition) =>
  (book.contributors ?? [])
    .map((c) => ({ role: c.role, person: typeof c.contributor === 'object' ? (c.contributor as Contributor) : null }))
    .filter((c): c is { role: typeof c.role; person: Contributor } => c.person !== null)

const yearOf = (iso?: string | null) => (iso ? new Date(iso).getUTCFullYear() : null)

const FORMAT_ORDER = ['paperback', 'hardback', 'special', 'boxset', 'board']

/**
 * The format picker's tiles: every edition of this book, paperback first. When two share a
 * format, the publisher and year tell them apart.
 */
export const formatOptionsFor = (
  book: Edition,
  editions: Edition[],
  settings: Parameters<typeof availabilityOf>[1],
  availability: Availability,
): Array<FormatOption & { availability: Availability; coverUrl?: string | null }> => {
  const formatCount = new Map<string, number>()
  for (const e of editions) formatCount.set(e.format ?? '', (formatCount.get(e.format ?? '') ?? 0) + 1)
  return [...editions]
    .sort((a, b) => FORMAT_ORDER.indexOf(a.format ?? '') - FORMAT_ORDER.indexOf(b.format ?? '') || (a.price ?? 0) - (b.price ?? 0))
    .map((e) => {
      const pub = typeof e.publisher === 'object' ? (e.publisher as Publisher | null)?.name : null
      const shared = (formatCount.get(e.format ?? '') ?? 0) > 1
      return {
        id: e.id,
        slug: e.slug,
        format: FORMAT_LABEL[e.format ?? 'paperback'] ?? e.format ?? '',
        detail: shared ? [pub, yearOf(e.publicationDate)].filter(Boolean).join(', ') || null : null,
        price: e.price,
        was: e.compareAtPrice,
        availability: e.id === book.id ? availability : availabilityOf(e, settings),
        current: e.id === book.id,
        coverUrl: e.coverUrl,
      }
    })
}

/** The page's title, description and sharing details, for a book or an item. */
export async function productMetadata(slug: string): Promise<Metadata> {
  const book = await getBookBySlug(slug)
  if (!book) return { title: 'Book not found' }
  const by = book.authorLine ? ` by ${book.authorLine}` : ''
  return {
    title: `${book.title}${by}`,
    description: book.synopsis?.slice(0, 155) ?? (book.kind === 'item' ? `${book.title} from AFTERWORD.` : `${book.title}${by}. Original edition from AFTERWORD.`),
    alternates: { canonical: productHref(book) },
    openGraph: {
      ...SHARE_DEFAULTS,
      title: `${book.title}${by}`,
      images: book.coverUrl ? [book.coverUrl] : undefined,
      ...(book.kind === 'item'
        ? { type: 'website' as const }
        : { type: 'book' as const, isbn: book.isbn13 ?? undefined, authors: book.authorLine ? book.authorLine.split(', ') : undefined }),
    },
    robots: robotsFor(book.status === 'published'),
  }
}

/**
 * The page for one book or one gift/stationery item. Books live at /book/…, items at /item/…;
 * opened at the other address, it sends the visitor (and search engines) to the right one.
 */
export async function ProductPage({ slug, route }: { slug: string; route: ProductRoute }) {
  const book = await getBookBySlug(slug)
  if (!book) notFound()
  if ((book.kind === 'item' ? 'item' : 'book') !== route) permanentRedirect(productHref(book))

  const payload = await getPayload({ config })
  const [settings, note, related, firstReviews, counts, customer, editions] = await Promise.all([
    getSettings(),
    getNoteFor(book.id),
    getRelated(book),
    reviewPage(payload, book.id, 1, 'newest', REVIEWS_ON_BOOK_PAGE),
    ratingCounts(payload, book.id),
    getCustomer(),
    getEditionsOf(book),
  ])
  const reviews = firstReviews.items
  // The average and count straight from the published reviews, so the stars always match the bars.
  const { total: reviewCount, average: reviewAverage } = reviewTotals(counts)
  const eligibility = await reviewEligibility(payload, customer, book.id)
  const availability = availabilityOf(book, settings)
  const people = contributorsOf(book)
  const authors = people.filter((p) => p.role === 'author')
  const others = people.filter((p) => p.role !== 'author')
  const publisher = typeof book.publisher === 'object' ? (book.publisher as Publisher | null) : null
  const subject = (book.subjects ?? []).find((s): s is Subject => typeof s === 'object') ?? null
  const series = typeof book.series === 'object' ? (book.series as Series | null) : null
  const year = yearOf(book.publicationDate)
  const paragraphs = (book.synopsis ?? '').split(/\n{2,}/).filter(Boolean)

  // The cover first, then any extra photos added in the admin.
  const photos: GalleryPhoto[] = [
    // The cover's real proportions when it is an upload, so it is drawn at its own shape.
    ...(book.coverUrl
      ? [
          {
            src: book.coverUrl,
            alt: `Cover of ${book.title}`,
            width: (typeof book.cover === 'object' && book.cover?.width) || 400,
            height: (typeof book.cover === 'object' && book.cover?.height) || 600,
            caption: null,
          },
        ]
      : []),
    ...(book.photos ?? [])
      .map((p) => ({ media: typeof p.image === 'object' ? (p.image as Media) : null, caption: p.caption }))
      .filter((p): p is { media: Media; caption: string | null | undefined } => Boolean(p.media?.filename))
      // A path on this site (like the covers), not Payload's full URL, so the image server accepts it.
      .map(({ media, caption }) => ({ src: `/api/media/file/${encodeURIComponent(media.filename!)}`, alt: media.alt || caption || `Photo of ${book.title}`, width: media.width, height: media.height, caption })),
  ]
  const formats = formatOptionsFor(book, editions, settings, availability)
  const label = availability.state === 'pre_order' ? 'Pre-order' : availability.state === 'on_request' ? 'Order on request' : 'Add to bag'

  // Gifts and stationery show what they are, not a book format, and only the details that apply.
  const isItem = book.kind === 'item'
  const typeLabel = isItem ? (ITEM_TYPE_LABEL[book.itemType ?? 'other'] ?? 'Gift') : (FORMAT_LABEL[book.format ?? 'paperback'] ?? book.format ?? '')
  const details: [string, string | number | null | undefined][] = [
    [isItem ? 'Type' : 'Format', typeLabel],
    ['Publisher', publisher?.name],
    ['Published', year],
    ['Pages', book.pages],
    ['Language', book.language],
    ['ISBN', book.isbn13],
    [
      'Size',
      book.heightMm && book.widthMm
        ? `${book.heightMm} × ${book.widthMm}${book.spineMm ? ` × ${book.spineMm}` : ''} mm`
        : null,
    ],
    ['Weight', book.weightG ? `${book.weightG} g` : null],
  ].filter(([name]) => !isItem || ['Type', 'Size', 'Weight'].includes(name as string)) as [string, string | number | null | undefined][]

  // Structured data so search engines can show the book, its price and availability.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isItem ? 'Product' : 'Book',
    name: book.title,
    isbn: isItem ? undefined : (book.isbn13 ?? undefined),
    sku: isItem ? (book.sku ?? `item-${book.id}`) : undefined,
    brand: isItem ? { '@type': 'Brand', name: 'AFTERWORD' } : undefined,
    author: authors.map((a) => ({ '@type': 'Person', name: a.person.name })),
    publisher: publisher ? { '@type': 'Organization', name: publisher.name } : undefined,
    numberOfPages: book.pages ?? undefined,
    bookFormat: isItem ? undefined : book.format === 'hardback' ? 'https://schema.org/Hardcover' : 'https://schema.org/Paperback',
    inLanguage: book.language ?? undefined,
    image: book.coverUrl ?? undefined,
    description: book.synopsis ?? undefined,
    url: `${siteUrl()}${productHref(book)}`,
    aggregateRating: reviewCount
      ? { '@type': 'AggregateRating', ratingValue: Number(reviewAverage!.toFixed(1)), reviewCount, bestRating: 5, worstRating: 1 }
      : undefined,
    review: reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      name: r.title,
      reviewBody: r.body,
      author: { '@type': 'Person', name: r.displayName },
      datePublished: r.createdAt.slice(0, 10),
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
    })),
    offers: book.price
      ? {
          '@type': 'Offer',
          url: `${siteUrl()}${productHref(book)}`,
          price: book.price,
          priceCurrency: 'BDT',
          itemCondition: 'https://schema.org/NewCondition',
          seller: { '@type': 'Organization', name: 'AFTERWORD' },
          availability: {
            in_stock: 'https://schema.org/InStock',
            pre_order: 'https://schema.org/PreOrder',
            on_request: 'https://schema.org/BackOrder',
            unavailable: 'https://schema.org/Discontinued',
          }[availability.state],
        }
      : undefined,
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', path: '/' },
      ...(subject ? [{ name: subject.name, path: `/subjects/${subject.slug}` }] : []),
      { name: book.title, path: productHref(book) },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${siteUrl()}${c.path}` })),
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbs} />

      {/* Where the book sits in the shop */}
      <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 pt-6 text-[0.8125rem] text-ink-soft md:pt-8">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
          </li>
          {subject ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/subjects/${subject.slug}`} className="hover:text-ink">
                  {subject.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li aria-current="page" className="max-w-[16rem] truncate text-ink">
            {book.title}
          </li>
        </ol>
      </nav>

      <article className="mx-auto mt-5 grid max-w-6xl gap-8 px-4 md:mt-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10 lg:gap-14">
        {/* Photos */}
        <div className="md:sticky md:top-32 md:self-start">
          <BookGallery
            photos={photos}
            tint={tintFor(book.id)}
            fallback={<Cover title={book.title} author={book.authorLine} src={null} className="h-[19rem] md:h-[26rem]" />}
          />
        </div>

        {/* Title, buy box and The Afterword */}
        <div className="min-w-0">
          <h1 className="display text-[2.125rem] leading-[1.08] md:text-[2.875rem]">{book.title}</h1>
          {book.subtitle ? <p className="mt-2 font-display text-[1.1875rem] text-ink-soft">{book.subtitle}</p> : null}

          {authors.length ? (
            <p className="mt-3 text-[1.0625rem]">
              <span className="text-ink-soft">by </span>
              {authors.map((a, i) => (
                <React.Fragment key={a.person.id}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/authors/${a.person.slug}`} className="font-medium underline decoration-rule underline-offset-4 hover:decoration-accent">
                    {a.person.name}
                  </Link>
                </React.Fragment>
              ))}
            </p>
          ) : null}
          {others.map((o) => (
            <p key={`${o.role}-${o.person.id}`} className="mt-0.5 text-[0.9375rem] text-ink-soft">
              {ROLE_LABEL[o.role] ?? o.role}{' '}
              <Link href={`/authors/${o.person.slug}`} className="link">
                {o.person.name}
              </Link>
            </p>
          ))}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.875rem] text-ink-soft">
            <span>{typeLabel}</span>
            {publisher ? (
              <Link href={`/publishers/${publisher.slug}`} className="hover:text-ink hover:underline">
                {publisher.name}
              </Link>
            ) : null}
            {year ? <span>{year}</span> : null}
            {series ? (
              <Link href={`/series/${series.slug}`} className="hover:text-ink hover:underline">
                {book.seriesNumber ? `${series.name} #${book.seriesNumber}` : series.name}
              </Link>
            ) : null}
          </div>

          {/* Buy box */}
          <section id="buy-box" aria-label="Buy this book" className="mt-6 rounded-ui border border-rule bg-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Price price={book.price} was={book.compareAtPrice} showSaving className="font-display text-[2rem] leading-none" />
              <AvailabilityMark availability={availability} className="text-[0.9375rem] font-semibold" />
            </div>

            <FormatPicker options={formats} />

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
              {availability.orderable && book.price ? (
                <AddToBag compact edition={book.id} label={label} />
              ) : (
                <button type="button" className="btn btn-primary w-full" disabled>
                  Unavailable
                </button>
              )}
              <ShelfButton iconOnly id={book.id} title={book.title} />
            </div>

            <ul className="mt-5 space-y-2 border-t border-rule pt-4 text-[0.875rem]">
              <li className="flex items-center gap-3">
                <ClockIcon />
                {availability.detail.replace(/\.$/, '')}
              </li>
              <li className="flex items-center gap-3">
                <TruckIcon />
                <span>
                  Delivery {formatTaka(settings.insideDhakaFee ?? 70)} in Dhaka, {formatTaka(settings.outsideDhakaFee ?? 130)} elsewhere
                </span>
              </li>
              {availability.orderable ? (
                <li className="flex items-center gap-3">
                  <CashIcon />
                  {availability.state === 'in_stock' ? 'Cash on delivery' : `${settings.advancePercent ?? 50}% advance, the rest on delivery`}
                </li>
              ) : null}
              {isItem ? null : (
                <li className="flex items-center gap-3">
                  <SealIcon />
                  Original edition, never a reprint
                </li>
              )}
            </ul>
          </section>

          {/* The Afterword: the bookseller's note sits right under the buy box, on purpose. */}
          {note ? (
            <figure className="mt-5 rounded-ui bg-paper-deep px-5 py-6 sm:px-6">
              <p className="text-[0.75rem] font-semibold tracking-[0.16em] text-accent uppercase">The Afterword</p>
              <blockquote className="mt-2.5 font-display text-[1.125rem] leading-relaxed">“{note.body}”</blockquote>
              <figcaption className="mt-3 text-[0.875rem] text-ink-soft">— {note.signedBy}, bookseller</figcaption>
            </figure>
          ) : null}
        </div>
      </article>

      {/* About the book, with the details beside it */}
      <div className="mx-auto mt-14 grid max-w-6xl gap-10 px-4 md:mt-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <section id="about" aria-labelledby="about-title" className="min-w-0 scroll-mt-32">
          <h2 id="about-title" className="font-display text-[1.5rem] font-medium md:text-[1.75rem]">
            {isItem ? 'About this item' : 'About the book'}
          </h2>
          {paragraphs.length ? (
            <Expandable lines={9} className="mt-4 max-w-[42rem]">
              <div className="prose-book space-y-4 text-[1.0625rem] leading-[1.75]">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Expandable>
          ) : (
            <p className="mt-4 text-ink-soft">{isItem ? 'We are writing a description for this item.' : 'We are writing a description for this book.'}</p>
          )}
        </section>

        <aside aria-labelledby="details-title" className="lg:pt-1">
          <div className="rounded-ui border border-rule bg-paper p-5">
            <h2 id="details-title" className="font-medium">
              {isItem ? 'Details' : 'Book details'}
            </h2>
            <dl className="mt-3 text-[0.875rem]">
              {details
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([name, value]) => (
                  <div key={name} className="flex justify-between gap-4 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
                    <dt className="text-ink-soft">{name}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </aside>
      </div>

      <div className="mx-auto mt-14 max-w-6xl border-t border-rule px-4 pt-12 md:mt-20 md:pt-16">
        <ReaderReviews
          editionId={book.id}
          href={productHref(book)}
          allHref={`${productHref(book)}/reviews`}
          first={reviews}
          counts={counts}
          eligibility={eligibility} book={{ title: book.title, authorLine: book.authorLine, coverUrl: book.coverUrl }} />
      </div>

      {/* Phones: price and button stay at hand once the buy box has scrolled away */}
      {availability.orderable && book.price ? (
        <StickyBuyBar watch="buy-box">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] text-ink-soft">{book.title}</p>
              <Price price={book.price} was={book.compareAtPrice} className="font-display text-[1.125rem] leading-tight" />
            </div>
            <div className="w-[11rem] shrink-0">
              <AddToBag compact edition={book.id} label={label} />
            </div>
          </div>
        </StickyBuyBar>
      ) : null}
      {/* Room at the very end of the page for that bar */}
      <div aria-hidden className="h-20 md:hidden" />

      <div className="mt-16 space-y-14 md:mt-24 md:space-y-20">
        <Shelf
          title={authors[0] ? `More by ${authors[0].person.name}` : 'More by this author'}
          books={related.byAuthor}
        />
        <Shelf
          title={subject ? `More in ${subject.name}` : 'You may also like'}
          href={subject ? `/subjects/${subject.slug}` : undefined}
          books={related.bySubject}
        />
      </div>
    </>
  )
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, className: 'shrink-0 text-ink-soft' }
const ClockIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)
const TruckIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6.5h11v9H3zM14 9.5h3.5l3 3v3H14" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
)
const CashIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="6.5" width="18" height="11" rx="1.5" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
)
const SealIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3.5 14 5l2.5-.3.9 2.3 2.3.9L19.4 10.5 21 12.5l-1.6 2 .3 2.5-2.3.9-.9 2.3-2.5-.3-2 1.6-2-1.6-2.5.3-.9-2.3-2.3-.9.3-2.5L3 12.5l1.6-2-.3-2.6 2.3-.9.9-2.3L10 5z" />
    <path d="m9 12.5 2 2 4-4.5" />
  </svg>
)
