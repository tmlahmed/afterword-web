import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import React from 'react'

import { ReviewList } from './ReviewList'
import { ReviewSummary, reviewTotals } from './Reviews'
import { formatOptionsFor, type ProductRoute } from './ProductPage'
import { ReviewBuyPanel } from './ReviewBuyPanel'
import { availabilityOf } from '../../lib/availability'
import { getBookBySlug, getEditionsOf, getSettings } from '../../lib/catalogue'
import { ITEM_TYPE_LABEL } from '../../lib/itemTypes'
import { productHref } from '../../lib/links'
import { ratingCounts, reviewEligibility, reviewPage } from '../../lib/reviews'
import { robotsFor, SHARE_DEFAULTS } from '../../lib/seo'
import { getCustomer } from '../../lib/session'
import config from '@payload-config'
import { getPayload } from 'payload'

/** More at a time here than on the book page: this page is for reading them. */
const PER_PAGE = 10

const reviewsHref = (book: { slug: string; kind?: string | null }) => `${productHref(book)}/reviews`

export async function productReviewsMetadata(slug: string): Promise<Metadata> {
  const book = await getBookBySlug(slug)
  if (!book) return { title: 'Not found' }
  const payload = await getPayload({ config })
  const { total } = reviewTotals(await ratingCounts(payload, book.id))
  const by = book.authorLine ? ` by ${book.authorLine}` : ''
  return {
    title: `Reviews of ${book.title}${by}`,
    description: total
      ? `${total} ${total === 1 ? 'review' : 'reviews'} of ${book.title}${by} from readers who bought it from AFTERWORD.`
      : `Reviews of ${book.title}${by} from readers who bought it from AFTERWORD.`,
    alternates: { canonical: reviewsHref(book) },
    openGraph: { ...SHARE_DEFAULTS, title: `Reviews of ${book.title}`, images: book.coverUrl ? [book.coverUrl] : undefined },
    // A page with nothing on it yet is left out of search results.
    robots: robotsFor(book.status === 'published' && total > 0),
  }
}

/**
 * Every review of one book or item, a page at a time, with the book itself kept beside them so
 * it can be put in the bag without going back. At /book/…/reviews and /item/…/reviews.
 */
export async function ProductReviewsPage({ slug, route }: { slug: string; route: ProductRoute }) {
  const book = await getBookBySlug(slug)
  if (!book) notFound()
  if ((book.kind === 'item' ? 'item' : 'book') !== route) permanentRedirect(reviewsHref(book))

  const payload = await getPayload({ config })
  const [settings, first, counts, customer, editions] = await Promise.all([
    getSettings(),
    reviewPage(payload, book.id, 1, 'newest', PER_PAGE),
    ratingCounts(payload, book.id),
    getCustomer(),
    getEditionsOf(book),
  ])
  const eligibility = await reviewEligibility(payload, customer, book.id)
  const { total } = reviewTotals(counts)
  const options = formatOptionsFor(book, editions, settings, availabilityOf(book, settings))
  const href = productHref(book)
  const reviewBook = { title: book.title, authorLine: book.authorLine, coverUrl: book.coverUrl }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 pt-6 text-[0.8125rem] text-ink-soft md:pt-8">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="max-w-[16rem] truncate">
            <Link href={href} className="hover:text-ink">
              {book.title}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink">
            Reviews
          </li>
        </ol>
      </nav>

      <div className="mx-auto mt-5 grid max-w-6xl gap-8 px-4 md:mt-8 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-14">
        {/* The book, to buy from here */}
        <aside aria-label="This book">
          <ReviewBuyPanel
            href={href}
            title={book.title}
            authorLine={book.authorLine}
            options={options}
            formatLabel={book.kind === 'item' ? (ITEM_TYPE_LABEL[book.itemType ?? ''] ?? null) : options[0]?.format}
          />
        </aside>

        {/* The reviews */}
        <section aria-labelledby="all-reviews-title" className="min-w-0">
          <h1 id="all-reviews-title" className="font-display text-[1.75rem] leading-tight font-medium md:text-[2.25rem]">
            Readers’ reviews
          </h1>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            of <span className="text-ink">{book.title}</span>
            {book.authorLine ? ` by ${book.authorLine}` : ''}
          </p>

          <div className="mt-6">
            <ReviewSummary editionId={book.id} href={reviewsHref(book)} counts={counts} eligibility={eligibility} book={reviewBook} wide />
          </div>

          <div className="mt-8">
            {total ? (
              <ReviewList editionId={book.id} initial={first.items} initialHasMore={first.hasMore} total={total} perPage={PER_PAGE} />
            ) : (
              <p className="rounded-ui border border-dashed border-rule px-5 py-8 text-center text-[0.9375rem] text-ink-soft">Reviews will appear here.</p>
            )}
          </div>
        </section>
      </div>
      {/* Room at the very end of the page for the phone buy bar */}
      <div aria-hidden className="h-20 md:hidden" />

    </>
  )
}
