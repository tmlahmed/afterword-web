import Link from 'next/link'
import React from 'react'

import type { Review } from '../../payload-types'
import { ReviewForm } from './Forms'

/** Five small stars, filled to the rating. Read out as "Rated 4 out of 5". */
export const Stars: React.FC<{ rating: number; className?: string }> = ({ rating, className = '' }) => (
  <span className={`inline-flex gap-0.5 text-ink ${className}`} role="img" aria-label={`Rated ${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden fill={i <= Math.round(rating) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
        <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
)

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })

type Eligibility = { canReview: true } | { canReview: false; reason: 'signed_out' | 'not_bought' | 'already' }

/** Readers' reviews on a book page: the average, the reviews, and the form for those who bought it. */
export const ReaderReviews: React.FC<{
  editionId: number
  slug: string
  reviews: Review[]
  average?: number | null
  count?: number | null
  eligibility: Eligibility
}> = ({ editionId, slug, reviews, average, count, eligibility }) => (
  <section id="reviews" className="mt-12 scroll-mt-40">
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-ink pt-3">
      <h2 className="display text-[1.5rem]">Readers’ reviews</h2>
      {count && average ? (
        <p className="flex items-center gap-2 text-[0.9375rem]">
          <Stars rating={average} />
          <span>
            {average.toFixed(1)} from {count} {count === 1 ? 'reader' : 'readers'}
          </span>
        </p>
      ) : null}
    </div>

    {reviews.length ? (
      <ul>
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-rule py-5">
            <Stars rating={r.rating} />
            <p className="mt-1.5 font-display text-[1.1875rem]">{r.title}</p>
            <p className="mt-2 max-w-[38rem] whitespace-pre-line leading-relaxed">{r.body}</p>
            <p className="mt-2 text-[0.8125rem] text-ink-soft">
              {r.displayName} · bought from us · {day(r.createdAt)}
            </p>
            {r.reply ? (
              <p className="mt-3 border-l-2 border-primary pl-3 text-[0.9375rem]">
                <span className="font-semibold">AFTERWORD replies:</span> {r.reply}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-5 text-ink-soft">No reviews yet.</p>
    )}

    <div id="review" className="mt-6 scroll-mt-40">
      {eligibility.canReview ? (
        <ReviewForm edition={editionId} />
      ) : eligibility.reason === 'already' ? (
        <p className="text-[0.9375rem] text-ink-soft">Thank you for reviewing this book. Reviews appear once we have read them.</p>
      ) : eligibility.reason === 'signed_out' ? (
        <p className="text-[0.9375rem] text-ink-soft">
          Reviews are written by readers who bought the book from us.{' '}
          <Link href={`/account/sign-in?next=${encodeURIComponent(`/book/${slug}#review`)}`} className="link text-ink">
            Sign in
          </Link>{' '}
          to review yours.
        </p>
      ) : (
        <p className="text-[0.9375rem] text-ink-soft">Reviews are written by readers who bought the book from us, once it has been delivered.</p>
      )}
    </div>
  </section>
)
