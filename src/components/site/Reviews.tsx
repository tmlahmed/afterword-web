import Link from 'next/link'
import React from 'react'

import type { ReviewItem } from '../../lib/reviews'
import { ReviewList, WriteReview } from './ReviewList'

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

type Eligibility = { canReview: true } | { canReview: false; reason: 'signed_out' | 'not_bought' | 'already' }

/**
 * Readers' reviews on a book page. A summary on the side (the average, a bar for each number of
 * stars, and the way to write one); the reviews themselves a few at a time beside it, so a book
 * with a hundred reviews is no longer than a book with five.
 */
export const ReaderReviews: React.FC<{
  editionId: number
  slug: string
  first: { items: ReviewItem[]; hasMore: boolean }
  counts: Record<1 | 2 | 3 | 4 | 5, number>
  average?: number | null
  eligibility: Eligibility
}> = ({ editionId, slug, first, counts, average, eligibility }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-32">
      <h2 id="reviews-title" className="font-display text-[1.5rem] font-medium md:text-[1.75rem]">
        Readers’ reviews
      </h2>

      <div className="mt-5 grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] md:gap-12">
        <aside className="md:sticky md:top-32 md:self-start">
          <div className="rounded-ui border border-rule bg-paper p-5">
            {total ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[2.75rem] leading-none tabular-nums">{(average ?? 0).toFixed(1)}</span>
                  <span className="text-[0.875rem] text-ink-soft">out of 5</span>
                </p>
                <Stars rating={average ?? 0} size={16} className="mt-2" />
                <p className="mt-1 text-[0.8125rem] text-ink-soft">
                  {total} {total === 1 ? 'review' : 'reviews'} from readers who bought it here
                </p>
                <ul className="mt-4 space-y-1.5">
                  {([5, 4, 3, 2, 1] as const).map((n) => (
                    <li key={n} className="flex items-center gap-2.5 text-[0.8125rem]">
                      <span className="w-3 text-right tabular-nums">{n}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                        <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
                      </svg>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${total ? (counts[n] / total) * 100 : 0}%` }} />
                      </span>
                      <span className="w-7 text-right text-ink-soft tabular-nums">{counts[n]}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="font-medium">No reviews yet</p>
                <p className="mt-1 text-[0.875rem] text-ink-soft">Readers who buy this book from us can be the first to say what they thought.</p>
              </>
            )}

            <div id="review" className="scroll-mt-32">
              {eligibility.canReview ? (
                <WriteReview edition={editionId} />
              ) : eligibility.reason === 'already' ? (
                <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">Thank you for your review. It appears once we have read it.</p>
              ) : eligibility.reason === 'signed_out' ? (
                <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">
                  Bought it from us?{' '}
                  <Link href={`/account/sign-in?next=${encodeURIComponent(`/book/${slug}#review`)}`} className="font-medium text-ink underline underline-offset-4">
                    Sign in
                  </Link>{' '}
                  to review it.
                </p>
              ) : (
                <p className="mt-4 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">Reviews come from readers who bought the book from us, once it has been delivered.</p>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {total ? (
            <ReviewList editionId={editionId} initial={first.items} initialHasMore={first.hasMore} total={total} />
          ) : (
            <p className="rounded-ui border border-dashed border-rule px-5 py-8 text-center text-[0.9375rem] text-ink-soft">Reviews will appear here.</p>
          )}
        </div>
      </div>
    </section>
  )
}
