'use client'

import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'

import type { Availability } from '../../lib/availability'
import { AvailabilityMark, Cover, Price } from './Books'
import { StickyBuyBar } from './BookParts'
import { type FormatOption, FormatPicker } from './FormatPicker'
import { AddToBag } from './Forms'

export type BuyOption = FormatOption & { availability: Availability; coverUrl?: string | null }

const buyLabel = (a: Availability) =>
  a.state === 'pre_order'
    ? 'Pre-order'
    : a.state === 'on_request'
      ? 'Order on request'
      : 'Add to bag'

/**
 * The book beside its reviews: cover, price and the button, with the formats to choose from so
 * it is clear which edition goes in the bag. Choosing a format here changes the price and the
 * button in place; the reviews stay where they are.
 */
export const ReviewBuyPanel: React.FC<{
  href: string
  title: string
  authorLine?: string | null
  /** Every edition, the one these reviews belong to marked `current`. Items have just one. */
  options: BuyOption[]
  /** Shown under the author when there is nothing to choose: "Paperback", or an item's type. */
  formatLabel?: string | null
}> = ({ href, title, authorLine, options, formatLabel }) => {
  const [selectedId, setSelectedId] = useState(
    () => (options.find((o) => o.current) ?? options[0]).id,
  )
  const chosen = options.find((o) => o.id === selectedId) ?? options[0]
  const canBuy = chosen.availability.orderable && !!chosen.price
  const cover = chosen.coverUrl ?? options.find((o) => o.current)?.coverUrl

  // Where the box sticks: under the header, or higher (even above the top of the screen) when
  // the box is taller than the room left, so its button stays reachable.
  const box = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(128)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const place = () => setTop(Math.min(128, window.innerHeight - el.offsetHeight - 24))
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])

  const button = canBuy ? (
    <AddToBag key={chosen.id} compact edition={chosen.id} label={buyLabel(chosen.availability)} />
  ) : (
    <button type="button" className="btn btn-primary w-full" disabled>
      Unavailable
    </button>
  )

  return (
    <>
      {/* One box for the book. On wider screens it stays in view while the reviews scroll; when
          it is taller than the screen, it settles with its button in view rather than its cover. */}
      <div
        ref={box}
        id="review-buy"
        style={{ top }}
        className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-4 rounded-ui border border-rule bg-paper p-4 md:sticky md:block md:p-5"
      >
        <Link
          href={href}
          className="block self-start md:mb-5"
          aria-label={`${title}: the book’s page`}
        >
          <Cover
            title={title}
            author={authorLine}
            src={cover}
            sizes="(min-width: 1024px) 20rem, (min-width: 768px) 16rem, 7rem"
            className="w-full"
          />
        </Link>
        <div className="min-w-0">
          <Link
            href={href}
            className="font-display text-[1.25rem] leading-tight hover:underline md:text-[1.375rem]"
          >
            {title}
          </Link>
          {authorLine ? <p className="mt-1 text-[0.875rem] text-ink-soft">{authorLine}</p> : null}
          {/* With formats to choose from, each tile already shows its price and stock. */}
          {options.length < 2 ? (
            <>
              {formatLabel ? (
                <p className="mt-1 text-[0.8125rem] font-medium">{formatLabel}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Price
                  price={chosen.price}
                  was={chosen.was}
                  className="font-display text-[1.375rem] leading-none"
                />
                <AvailabilityMark
                  availability={chosen.availability}
                  className="text-[0.8125rem] font-semibold"
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="col-span-2 md:mt-1 [&_fieldset]:mt-0 md:[&_fieldset]:mt-5">
          <FormatPicker options={options} onPick={setSelectedId} selected={chosen.id} />
          <div className="mt-4">{button}</div>
        </div>
      </div>

      {/* Phones: the button stays at hand while reading */}
      {canBuy ? (
        <>
          <StickyBuyBar watch="review-buy">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] text-ink-soft">
                  {title}
                  {options.length > 1 ? ` · ${chosen.format}` : ''}
                </p>
                <Price
                  price={chosen.price}
                  was={chosen.was}
                  className="font-display text-[1.125rem] leading-tight"
                />
              </div>
              <div className="w-[11rem] shrink-0">
                <AddToBag
                  key={chosen.id}
                  compact
                  edition={chosen.id}
                  label={buyLabel(chosen.availability)}
                />
              </div>
            </div>
          </StickyBuyBar>
        </>
      ) : null}
    </>
  )
}
