import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { AvailabilityMark, Cover, Price, Shelf, tintFor } from '../../../../components/site/Books'
import { AddToBag } from '../../../../components/site/Forms'
import { ShelfButton } from '../../../../components/site/TheShelf'
import { availabilityOf } from '../../../../lib/availability'
import { getBookBySlug, getNoteFor, getRelated, getSettings } from '../../../../lib/catalogue'
import type { Contributor, Edition, Publisher, Series, Subject } from '../../../../payload-types'
import { siteUrl } from '../../../../lib/notify'
import { robotsFor, SHARE_DEFAULTS } from '../../../../lib/seo'
import { JsonLd } from '../../../../components/site/JsonLd'
import { ReaderReviews, Stars } from '../../../../components/site/Reviews'
import { getReviews, reviewEligibility } from '../../../../lib/reviews'
import { getCustomer } from '../../../../lib/session'
import config from '@payload-config'
import { getPayload } from 'payload'

type Props = { params: Promise<{ slug: string }> }

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const book = await getBookBySlug(slug)
  if (!book) return { title: 'Book not found' }
  const by = book.authorLine ? ` by ${book.authorLine}` : ''
  return {
    title: `${book.title}${by}`,
    description: book.synopsis?.slice(0, 155) ?? `${book.title}${by}. Original edition from AFTERWORD.`,
    alternates: { canonical: `/book/${book.slug}` },
    openGraph: {
      ...SHARE_DEFAULTS,
      title: `${book.title}${by}`,
      images: book.coverUrl ? [book.coverUrl] : undefined,
      type: 'book',
      isbn: book.isbn13,
      authors: book.authorLine ? book.authorLine.split(', ') : undefined,
    },
    robots: robotsFor(book.status === 'published'),
  }
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params
  const book = await getBookBySlug(slug)
  if (!book) notFound()

  const payload = await getPayload({ config })
  const [settings, note, related, reviews, customer] = await Promise.all([
    getSettings(),
    getNoteFor(book.id),
    getRelated(book),
    getReviews(payload, book.id),
    getCustomer(),
  ])
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

  const details: [string, string | number | null | undefined][] = [
    ['Format', FORMAT_LABEL[book.format] ?? book.format],
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
  ]

  // Structured data so search engines can show the book, its price and availability.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    isbn: book.isbn13,
    author: authors.map((a) => ({ '@type': 'Person', name: a.person.name })),
    publisher: publisher ? { '@type': 'Organization', name: publisher.name } : undefined,
    numberOfPages: book.pages ?? undefined,
    bookFormat: book.format === 'hardback' ? 'https://schema.org/Hardcover' : 'https://schema.org/Paperback',
    inLanguage: book.language ?? undefined,
    image: book.coverUrl ?? undefined,
    description: book.synopsis ?? undefined,
    url: `${siteUrl()}/book/${book.slug}`,
    aggregateRating: book.ratingCount
      ? { '@type': 'AggregateRating', ratingValue: book.ratingAverage, reviewCount: book.ratingCount, bestRating: 5, worstRating: 1 }
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
          url: `${siteUrl()}/book/${book.slug}`,
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
      { name: book.title, path: `/book/${book.slug}` },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${siteUrl()}${c.path}` })),
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbs} />

      <article className="mx-auto max-w-6xl md:grid md:grid-cols-[5fr_7fr] md:gap-x-14 md:px-4 md:pt-10">
        {/* Cover */}
        <div className="md:sticky md:top-36 md:self-start">
          <div className={`flex items-center justify-center px-8 py-10 md:py-14 ${tintFor(book.id)}`}>
            <Cover title={book.title} author={book.authorLine} src={book.coverUrl} priority sizes="(min-width: 768px) 18rem, 13rem" className="h-[19rem] md:h-[26rem]" />
          </div>
        </div>

        <div className="px-4 pt-7 md:px-0 md:pt-2">
          {subject ? (
            <nav aria-label="Breadcrumb" className="eyebrow">
              <Link href={`/subjects/${subject.slug}`} className="hover:text-ink">
                {subject.name}
              </Link>
            </nav>
          ) : null}

          <h1 className="display mt-3 text-[2.25rem] md:text-[3.25rem]">{book.title}</h1>
          {book.subtitle ? <p className="mt-2 font-display text-[1.25rem] text-ink-soft">{book.subtitle}</p> : null}

          {authors.length ? (
            <p className="mt-3 font-display text-[1.25rem] text-ink-soft">
              {authors.map((a, i) => (
                <React.Fragment key={a.person.id}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/authors/${a.person.slug}`} className="hover:underline hover:decoration-accent hover:underline-offset-4">
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
          {series ? (
            <p className="mt-2 text-[0.9375rem] text-ink-soft">
              {book.seriesNumber ? `Book ${book.seriesNumber} of ` : 'Part of '}
              <Link href={`/series/${series.slug}`} className="link">
                {series.name}
              </Link>
            </p>
          ) : null}

          {book.ratingCount && book.ratingAverage ? (
            <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-[0.875rem] text-ink-soft hover:text-ink">
              <Stars rating={book.ratingAverage} />
              {book.ratingAverage.toFixed(1)} · {book.ratingCount} {book.ratingCount === 1 ? 'review' : 'reviews'}
            </a>
          ) : null}

          <p className="mt-4 text-[0.875rem] text-ink-soft">
            {FORMAT_LABEL[book.format]}
            {publisher ? (
              <>
                {' · '}
                <Link href={`/publishers/${publisher.slug}`} className="hover:text-ink hover:underline">
                  {publisher.name}
                </Link>
              </>
            ) : null}
            {year ? ` · ${year}` : ''}
          </p>

          {/* Buy box */}
          <div className="mt-7 border-y border-ink py-6">
            <div className="flex items-baseline justify-between gap-4">
              <Price price={book.price} was={book.compareAtPrice} showSaving className="font-display text-[2rem] leading-none" />
              <AvailabilityMark availability={availability} className="text-[0.9375rem] font-semibold" />
            </div>
            <p className="mt-3 text-[0.9375rem] text-ink-soft">{availability.detail}</p>

            {availability.orderable && book.price ? (
              <AddToBag
                edition={book.id}
                label={availability.state === 'pre_order' ? 'Pre-order' : availability.state === 'on_request' ? 'Order on request' : 'Add to bag'}
              />
            ) : (
              <button type="button" className="btn btn-primary mt-5 w-full" disabled>
                Unavailable
              </button>
            )}
            {availability.state !== 'in_stock' && availability.orderable ? (
              <p className="mt-2 text-center text-[0.8125rem] text-ink-soft">
                {settings.advancePercent ?? 50}% is paid in advance, the rest on delivery.
              </p>
            ) : null}

            <div className="mt-4">
              <ShelfButton id={book.id} title={book.title} />
            </div>

            <p className="mt-5 flex items-start gap-2.5 text-[0.875rem]">
              <span aria-hidden className="mt-[0.4rem] inline-block h-[7px] w-[7px] shrink-0 rotate-45 bg-accent" />
              <span>
                <strong className="font-semibold">Original edition.</strong> A genuine copy from the publisher, never a
                reprint.
              </span>
            </p>
          </div>

          {/* The Afterword — the bookseller's note sits above the synopsis, on purpose. */}
          {note ? (
            <figure className="mt-9 bg-paper-deep px-6 py-7">
              <p className="eyebrow !text-accent">The Afterword</p>
              <blockquote className="mt-3 font-display text-[1.1875rem] leading-relaxed">{note.body}</blockquote>
              <figcaption className="mt-4 text-[0.875rem] text-ink-soft">— {note.signedBy}</figcaption>
            </figure>
          ) : null}

          {paragraphs.length ? (
            <section className="mt-10">
              <h2 className="eyebrow">About the book</h2>
              <div className="prose-book mt-3 max-w-[38rem] text-[1.0625rem] leading-[1.7]">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="eyebrow">Details</h2>
            <dl className="mt-3 max-w-[38rem] border-t border-rule text-[0.9375rem]">
              {details
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-6 border-b border-rule py-2.5">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <ReaderReviews
            editionId={book.id}
            slug={book.slug}
            reviews={reviews}
            average={book.ratingAverage}
            count={book.ratingCount}
            eligibility={eligibility}
          />
        </div>
      </article>

      <div className="mt-16 space-y-14 md:mt-24 md:space-y-20">
        <Shelf title="Other editions" intro="The same book in another format." books={related.editions} />
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
