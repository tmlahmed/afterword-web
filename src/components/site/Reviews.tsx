import Link from 'next/link'
import React from 'react'

import type { ReviewItem } from '../../lib/reviews'
import { ReviewEntry, WriteReview } from './ReviewList'

/** Five small stars, filled to the rating. Read out as "Rated 4 out of 5". */
export const Stars: React.FC<{ rating: number; className?: string; size?: number }> = ({ rating, className = '', size = 14 }) => (
  <span className={`inline-flex gap-0.5 text-ink ${className}`} role="img" aria-label={`Rated ${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={i <= Math.round(rating) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
        <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
)

export type Eligibility = { canReview: true } | { canReview: false; reason: 'signed_out' | 'not_bought' | 'already' }
export type ReviewCounts = Record<1 | 2 | 3 | 4 | 5, number>
type ReviewBookInfo = { title: string; authorLine?: string | null; coverUrl?: string | null }

/** How many reviews the counts add up to, and their average. */
export const reviewTotals = (counts: ReviewCounts) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const average = total ? Object.entries(counts).reduce((sum, [stars, n]) => sum + Number(stars) * n, 0) / total : null
  return { total, average }
}

/**
 * The average, a bar for each number of stars, and the way to write a review. Narrow beside the
 * reviews on a book page; `wide` lays the average and the bars side by side, above the list on
 * the all-reviews page.
 */
export const ReviewSummary: React.FC<{
  editionId: number
  /** The page this sits on, for the sign-in link back. */
  href: string
  counts: ReviewCounts
  eligibility: Eligibility
  book: ReviewBookInfo
  wide?: boolean
}> = ({ editionId, href, counts, eligibility, book, wide = false }) => {
  const { total, average } = reviewTotals(counts)
  return (
    <div className="rounded-ui border border-rule bg-paper p-5">
      {total ? (
        <div className={wide ? 'grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-8' : ''}>
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[2.75rem] leading-none tabular-nums">{(average ?? 0).toFixed(1)}</span>
              <span className="text-[0.875rem] text-ink-soft">out of 5</span>
            </p>
            <Stars rating={average ?? 0} size={16} className="mt-2" />
            <p className="mt-1 text-[0.8125rem] text-ink-soft">
              {total} {total === 1 ? 'review' : 'reviews'} from readers who bought it here
            </p>
          </div>
          <ul className={`space-y-1.5 ${wide ? '' : 'mt-4'}`}>
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n} className="flex items-center gap-2.5 text-[0.8125rem]">
                <span className="w-3 text-right tabular-nums">{n}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                  <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
                </svg>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(counts[n] / total) * 100}%` }} />
                </span>
                <span className="w-7 text-right text-ink-soft tabular-nums">{counts[n]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="font-medium">No reviews yet</p>
          <p className="mt-1 text-[0.875rem] text-ink-soft">Readers who buy this from us can be the first to say what they thought.</p>
        </>
      )}

      <div className={wide ? 'sm:[&>.btn]:w-auto' : ''}>
        {eligibility.canReview ? (
          <WriteReview edition={editionId} book={book} />
        ) : eligibility.reason === 'already' ? (
          <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">
            Thank you for your review. It appears once we have read it.{' '}
            <Link href="/account?view=reviews" className="font-medium text-ink underline underline-offset-4">
              Your reviews
            </Link>
          </p>
        ) : eligibility.reason === 'signed_out' ? (
          <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">
            Bought it from us?{' '}
            <Link href={`/account/sign-in?next=${encodeURIComponent(`${href}#review`)}`} className="font-medium text-ink underline underline-offset-4">
              Sign in
            </Link>{' '}
            to review it.
          </p>
        ) : (
          <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">Reviews come from readers who bought it from us, once it has been delivered.</p>
        )}
      </div>
    </div>
  )
}

/** How many reviews a book page shows before "See all reviews". */
export const REVIEWS_ON_BOOK_PAGE = 3

/**
 * Readers' reviews on a book page: the summary on the side and the newest few reviews beside it.
 * The rest are on the book's own reviews page (`allHref`), where the book can be bought too.
 */
export const ReaderReviews: React.FC<{
  editionId: number
  /** This page's address, for the sign-in link. */
  href: string
  /** The page with every review. */
  allHref: string
  first: ReviewItem[]
  counts: ReviewCounts
  eligibility: Eligibility
  /** The book, shown at the top of the review form. */
  book: ReviewBookInfo
}> = ({ editionId, href, allHref, first, counts, eligibility, book }) => {
  const { total } = reviewTotals(counts)
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-32">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="reviews-title" className="font-display text-[1.5rem] font-medium md:text-[1.75rem]">
          Readers’ reviews
        </h2>
        {total > REVIEWS_ON_BOOK_PAGE ? (
          <Link href={allHref} className="text-[0.9375rem] font-medium underline underline-offset-4 hover:text-accent">
            See all {total} reviews
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] md:gap-12">
        <aside className="md:sticky md:top-32 md:self-start">
          <ReviewSummary editionId={editionId} href={href} counts={counts} eligibility={eligibility} book={book} />
        </aside>

        <div className="min-w-0">
          {total ? (
            <>
              <ul className="-mt-5 divide-y divide-rule">
                {first.slice(0, REVIEWS_ON_BOOK_PAGE).map((r) => (
                  <ReviewEntry key={r.id} review={r} />
                ))}
              </ul>
              {total > REVIEWS_ON_BOOK_PAGE ? (
                <Link href={allHref} className="btn btn-quiet mt-2 w-full sm:w-auto">
                  See all {total} reviews
                </Link>
              ) : null}
            </>
          ) : (
            <p className="rounded-ui border border-dashed border-rule px-5 py-8 text-center text-[0.9375rem] text-ink-soft">Reviews will appear here.</p>
          )}
        </div>
      </div>
    </section>
  )
}
