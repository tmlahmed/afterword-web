import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { type Availability, availabilityOf } from '../../lib/availability'
import type { BookCardData } from '../../lib/catalogue'
import { formatTaka } from '../../lib/pricing'
import { ArrowIcon } from './Brand'

const TINTS = ['bg-tint-sage', 'bg-tint-clay', 'bg-tint-slate', 'bg-tint-straw'] as const
export const tintFor = (id: number): string => TINTS[id % TINTS.length]

/**
 * A book cover, shown as an object with a soft shadow. Books without a cover image get a
 * typeset one, so a missing image never leaves a hole in a shelf.
 */
export const Cover: React.FC<{
  title: string
  author?: string | null
  src?: string | null
  className?: string
  priority?: boolean
  /** How wide the cover is drawn, so phones download a small image. */
  sizes?: string
}> = ({ title, author, src, className = '', priority = false, sizes = '(min-width: 768px) 11rem, 38vw' }) =>
  src ? (
    // Resized and converted to WebP/AVIF by the image server, then cached.
    <Image
      src={src}
      alt={`Cover of ${title}`}
      width={400}
      height={600}
      sizes={sizes}
      priority={priority}
      className={`block w-auto max-w-full rounded-[2px] object-contain shadow-book ${className}`}
    />
  ) : (
    <div
      role="img"
      aria-label={`Cover of ${title}`}
      className={`flex aspect-[2/3] flex-col justify-between rounded-[2px] bg-primary p-3 text-paper shadow-book ${className}`}
    >
      <span className="font-display text-[0.9375rem] leading-tight">{title}</span>
      {author ? <span className="text-[0.625rem] uppercase tracking-[0.14em] opacity-80">{author}</span> : null}
    </div>
  )

const DOT: Record<Availability['state'], string> = {
  in_stock: 'bg-primary',
  pre_order: 'bg-accent',
  on_request: 'border border-ink-soft',
  unavailable: 'bg-rule',
}

export const AvailabilityMark: React.FC<{ availability: Availability; className?: string }> = ({
  availability,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`}>
    <span className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${DOT[availability.state]}`} />
    {availability.label}
  </span>
)

export const Price: React.FC<{ price?: number | null; was?: number | null; className?: string }> = ({
  price,
  was,
  className = '',
}) =>
  price ? (
    <span className={`tabular-nums ${className}`}>
      <span className="font-semibold">{formatTaka(price)}</span>
      {was && was > price ? <s className="ml-2 font-normal text-ink-faint">{formatTaka(was)}</s> : null}
    </span>
  ) : (
    <span className={`text-ink-faint ${className}`}>Price on request</span>
  )

export const BookCard: React.FC<{ book: BookCardData; className?: string }> = ({ book, className = '' }) => {
  const availability = availabilityOf(book)
  return (
    <Link href={`/book/${book.slug}`} className={`group block ${className}`}>
      <div className={`flex h-[13.5rem] items-end justify-center px-4 pb-0 pt-5 md:h-[15.5rem] ${tintFor(book.id)}`}>
        <Cover
          title={book.title}
          author={book.authorLine}
          src={book.coverUrl}
          className="h-full max-h-full translate-y-2 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
        />
      </div>
      <div className="pt-5">
        <h3 className="line-clamp-2 font-display text-[1.0625rem] leading-snug group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4">
          {book.title}
        </h3>
        {book.authorLine ? <p className="mt-0.5 truncate text-[0.8125rem] text-ink-soft">{book.authorLine}</p> : null}
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[0.8125rem]">
          <Price price={book.price} was={book.compareAtPrice} className="text-[0.9375rem]" />
          <AvailabilityMark availability={availability} className="text-ink-soft" />
        </p>
      </div>
    </Link>
  )
}

/** A horizontal shelf: swipes on phones, scrolls on desktop. */
export const Shelf: React.FC<{ title: string; intro?: string | null; href?: string; books: BookCardData[] }> = ({
  title,
  intro,
  href,
  books,
}) =>
  books.length === 0 ? null : (
    <section className="mx-auto max-w-6xl px-4">
      <div className="flex items-end justify-between gap-6 border-t border-ink pt-4">
        <div>
          <h2 className="display text-[1.75rem] md:text-[2.125rem]">{title}</h2>
          {intro ? <p className="mt-1 max-w-xl text-[0.9375rem] text-ink-soft">{intro}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="hidden shrink-0 items-center gap-1.5 pb-1 text-[0.8125rem] font-semibold sm:inline-flex">
            See all <ArrowIcon />
          </Link>
        ) : null}
      </div>
      <div className="shelf-row mt-6">
        {books.map((book) => (
          <BookCard key={book.id} book={book} className="w-[9.75rem] shrink-0 snap-start md:w-[11rem]" />
        ))}
        {href ? (
          <Link
            href={href}
            className="flex h-[13.5rem] w-[7rem] shrink-0 snap-start flex-col items-center justify-center gap-2 border border-rule text-[0.8125rem] font-semibold md:h-[15.5rem]"
          >
            See all <ArrowIcon />
          </Link>
        ) : null}
      </div>
    </section>
  )

export const BookGrid: React.FC<{ books: BookCardData[] }> = ({ books }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {books.map((book) => (
      <BookCard key={book.id} book={book} />
    ))}
  </div>
)

export const Pager: React.FC<{ page: number; totalPages: number; hrefFor: (page: number) => string }> = ({
  page,
  totalPages,
  hrefFor,
}) =>
  totalPages <= 1 ? null : (
    <nav aria-label="Pages" className="mt-14 flex items-center justify-between border-t border-rule pt-5 text-[0.875rem]">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="font-semibold">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-ink-soft">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="font-semibold">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
