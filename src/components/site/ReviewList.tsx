'use client'

import React, { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { loadReviews } from '../../app/(frontend)/actions'
import type { ReviewItem, ReviewSort } from '../../lib/reviews'
import { Expandable } from './BookParts'
import { CloseIcon } from './Brand'
import { ReviewForm } from './Forms'
import { lockScroll } from '../../lib/scrollLock'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })

const SmallStars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="inline-flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden fill={i <= rating ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
        <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
)

/**
 * A book's reviews a few at a time: the first page comes with the page, "Show more" fetches the
 * next, and the order can be changed. Long reviews are shortened with "Read more".
 */
export const ReviewList: React.FC<{ editionId: number; initial: ReviewItem[]; initialHasMore: boolean; total: number }> = ({ editionId, initial, initialHasMore, total }) => {
  const [items, setItems] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [pending, start] = useTransition()

  const more = () =>
    start(async () => {
      const next = await loadReviews(editionId, page + 1, sort)
      setItems((x) => [...x, ...next.items.filter((n) => !x.some((o) => o.id === n.id))])
      setHasMore(next.hasMore)
      setPage((p) => p + 1)
    })
  const reorder = (to: ReviewSort) => {
    setSort(to)
    start(async () => {
      const first = await loadReviews(editionId, 1, to)
      setItems(first.items)
      setHasMore(first.hasMore)
      setPage(1)
    })
  }

  if (!items.length) return null
  return (
    <div>
      {total > 1 ? (
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-rule pb-3">
          <p className="text-[0.875rem] text-ink-soft">
            Showing {items.length} of {total}
          </p>
          <label className="flex items-center gap-2 text-[0.875rem]">
            <span className="text-ink-soft">Sort by</span>
            <select
              value={sort}
              onChange={(e) => reorder(e.target.value as ReviewSort)}
              className="h-9 rounded-ui border border-rule bg-paper px-2 text-[0.875rem] focus:border-ink focus:outline-none"
            >
              <option value="newest">Newest</option>
              <option value="highest">Highest rated</option>
              <option value="lowest">Lowest rated</option>
            </select>
          </label>
        </div>
      ) : null}

      <ul className={`divide-y divide-rule transition-opacity ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
        {items.map((r) => (
          <li key={r.id} className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <SmallStars rating={r.rating} />
              <span className="text-[0.8125rem] text-ink-faint">{day(r.createdAt)}</span>
            </div>
            <p className="mt-2 font-medium">{r.title}</p>
            <Expandable lines={5} className="mt-1.5">
              <p className="whitespace-pre-line leading-relaxed text-ink-soft">{r.body}</p>
            </Expandable>
            <p className="mt-2.5 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
              <span className="font-medium text-ink">{r.displayName}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 8.5 3 3 7-7" />
                </svg>
                Bought from us
              </span>
            </p>
            {r.reply ? (
              <div className="mt-3 rounded-ui bg-paper-deep px-4 py-3 text-[0.9375rem]">
                <p className="text-[0.75rem] font-semibold tracking-[0.12em] text-accent uppercase">AFTERWORD replies</p>
                <p className="mt-1">{r.reply}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button type="button" onClick={more} disabled={pending} className="btn btn-quiet mt-2 w-full sm:w-auto">
          {pending ? 'Loading…' : `Show more reviews (${total - items.length} more)`}
        </button>
      ) : null}
    </div>
  )
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** "Write a review": the form opens in a window over the page (also when arriving at #review). */
export const WriteReview: React.FC<{ edition: number }> = ({ edition }) => {
  const [clicked, setClicked] = useState(false)
  const [closedHash, setClosedHash] = useState(false)
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '')
  const open = clicked || (hash === '#review' && !closedHash)
  const close = () => {
    setClicked(false)
    setClosedHash(true)
    if (window.location.hash === '#review') history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const unlock = lockScroll()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      unlock()
    }
  })
  return (
    <>
      <button type="button" onClick={() => setClicked(true)} className="btn btn-primary mt-4 w-full">
        Write a review
      </button>
      {open
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label="Write a review" onClick={close} className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/60 sm:items-center sm:p-4">
              <div onClick={(e) => e.stopPropagation()} className="relative max-h-[92vh] w-full max-w-[36rem] overflow-y-auto rounded-t-[12px] bg-paper sm:rounded-ui">
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper-deep hover:text-ink"
                >
                  <CloseIcon />
                </button>
                <ReviewForm edition={edition} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
