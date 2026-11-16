'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react'

import { setQuantity } from '../../app/(frontend)/actions'
import { formatTaka } from '../../lib/pricing'
import { BagIcon, CloseIcon } from './Brand'
import { QtyStepper } from './QtyStepper'

export type MiniBagLine = {
  id: number
  title: string
  slug: string
  authorLine?: string | null
  coverUrl?: string | null
  unitPrice: number
  quantity: number
  /** Most copies the customer may have of this book. */
  max: number
  note: string
  problem?: string
}

export type MiniBagData = {
  count: number
  lines: MiniBagLine[]
  subtotal: number
  /** Promotion discount on the books, used to judge free delivery. */
  discount: number
  /** How much more for free delivery (anywhere in Bangladesh); 0 when already free or there is no offer. */
  freeShortfall: number
  freeAbove: number
}

/** Fired by the buy button after a book is added, so the bag opens to show it. */
export const BAG_ADDED_EVENT = 'afterword:bag-added'

const AUTO_CLOSE_MS = 6000
const HOVER_CLOSE_MS = 220

/**
 * The bag in the header. Hovering the icon (or tapping it) opens a small panel with the books,
 * their quantities and the subtotal, so shoppers can carry on browsing. Without JavaScript the
 * icon is a plain link to the bag page.
 */
export const MiniBag: React.FC<{ data: MiniBagData }> = ({ data }) => {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // Quantities change on screen at once; the server's answer replaces them a moment later.
  const [lines, setOptimisticQty] = useOptimistic(data.lines, (current, change: { id: number; quantity: number }) =>
    change.quantity <= 0 ? current.filter((l) => l.id !== change.id) : current.map((l) => (l.id === change.id ? { ...l, quantity: change.quantity } : l)),
  )
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerInside = useRef(false)

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const closeAfter = useCallback((ms: number) => {
    clearTimer()
    timer.current = setTimeout(() => {
      // Never close under the shopper's pointer or while they are using the panel.
      if (pointerInside.current || root.current?.contains(document.activeElement)) return
      setOpen(false)
    }, ms)
  }, [])

  // Open when a book is added anywhere on the page, then close on its own.
  useEffect(() => {
    const onAdded = () => {
      setOpen(true)
      closeAfter(AUTO_CLOSE_MS)
    }
    window.addEventListener(BAG_ADDED_EVENT, onAdded)
    return () => window.removeEventListener(BAG_ADDED_EVENT, onAdded)
  }, [closeAfter])

  // Escape and clicks elsewhere close it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  useEffect(() => clearTimer, [])

  const hoverCapable = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

  const change = (line: MiniBagLine, quantity: number) => {
    const form = new FormData()
    form.set('edition', String(line.id))
    form.set('quantity', String(quantity))
    startTransition(async () => {
      setOptimisticQty({ id: line.id, quantity })
      await setQuantity(form)
    })
  }

  const { freeAbove, discount } = data
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const freeShortfall = pending && freeAbove > 0 ? Math.max(0, freeAbove - (subtotal - discount)) : data.freeShortfall

  return (
    <div
      ref={root}
      className="-mr-2"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse' || !hoverCapable()) return
        pointerInside.current = true
        clearTimer()
        setOpen(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        pointerInside.current = false
        closeAfter(HOVER_CLOSE_MS)
      }}
    >
      <Link
        href="/bag"
        aria-label={`Your bag, ${count} ${count === 1 ? 'book' : 'books'}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          // With a mouse the panel is already open on hover, so a click goes to the bag page.
          if (hoverCapable()) return
          e.preventDefault()
          clearTimer()
          setOpen((o) => !o)
        }}
        className="relative flex h-11 w-11 items-center justify-center"
      >
        <BagIcon />
        {count ? (
          <span className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-paper">
            {count}
          </span>
        ) : null}
      </Link>

      <div
        id={panelId}
        role="dialog"
        aria-label="Your bag"
        hidden={!open}
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-ink bg-paper shadow-[0_24px_40px_-24px_rgb(26_29_27/0.4)] md:left-auto md:right-4 md:w-[25rem] md:overflow-visible md:border"
      >
        {/* A small notch pointing at the icon (wider screens). */}
        <span aria-hidden className="absolute -top-[7px] right-5 hidden h-3 w-3 rotate-45 border-l border-t border-ink bg-paper md:block" />
        <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
          <p className="display text-[1.375rem]">
            Your bag{count ? <span className="ml-2 font-sans text-[0.875rem] text-ink-soft">{count} {count === 1 ? 'book' : 'books'}</span> : null}
          </p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the bag" className="-mr-2 flex h-9 w-9 items-center justify-center">
            <CloseIcon />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 pb-6">
            <p className="text-ink-soft">Your bag is empty.</p>
            <Link href="/collections" onClick={() => setOpen(false)} className="link mt-2 inline-block text-[0.9375rem]">
              Find something to read
            </Link>
          </div>
        ) : (
          <>
            <ul className="max-h-[22rem] overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3.5 border-t border-rule py-3.5">
                  <Link href={`/book/${l.slug}`} onClick={() => setOpen(false)} className="shrink-0">
                    {l.coverUrl ? (
                      <Image src={l.coverUrl} alt="" width={56} height={84} sizes="56px" className="h-[5.25rem] w-auto max-w-[3.5rem] rounded-[2px] object-contain shadow-book" />
                    ) : (
                      <span className="block h-[5.25rem] w-14 rounded-[2px] bg-primary" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/book/${l.slug}`} onClick={() => setOpen(false)} className="line-clamp-2 font-display text-[1.0625rem] leading-snug hover:underline">
                      {l.title}
                    </Link>
                    {l.authorLine ? <p className="truncate text-[0.8125rem] text-ink-soft">{l.authorLine}</p> : null}
                    <p className={`mt-0.5 text-[0.75rem] ${l.problem ? 'text-[#7a2218]' : 'text-ink-faint'}`}>{l.problem ?? l.note}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <QtyStepper title={l.title} quantity={l.quantity} max={l.max} onChange={(q) => change(l, q)} />
                      <span className="font-semibold tabular-nums">{formatTaka(l.unitPrice * l.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-ink px-5 pb-5 pt-3.5">
              <div className="flex items-baseline justify-between">
                <span>
                  Subtotal <span className="text-[0.875rem] text-ink-soft">({count} {count === 1 ? 'book' : 'books'})</span>
                </span>
                <span className="font-display text-[1.375rem] tabular-nums">{formatTaka(subtotal)}</span>
              </div>
              {freeAbove > 0 ? (
                <div className="mt-3 bg-paper-deep px-3.5 py-2.5 text-[0.875rem]">
                  {freeShortfall > 0 ? (
                    <>
                      Add <strong>{formatTaka(freeShortfall)}</strong> more for free delivery anywhere in Bangladesh.
                      <span aria-hidden className="mt-2 block h-1 bg-rule">
                        <span className="block h-1 bg-primary" style={{ width: `${Math.min(100, Math.round(((freeAbove - freeShortfall) / freeAbove) * 100))}%` }} />
                      </span>
                    </>
                  ) : (
                    <>Your delivery is free, anywhere in Bangladesh.</>
                  )}
                </div>
              ) : null}
              {/* The bag comes first: gift wrap, promotion codes and the full totals are there. */}
              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <Link href="/bag" onClick={() => setOpen(false)} className="btn btn-primary w-full">
                  View bag
                </Link>
                <Link href="/checkout" onClick={() => setOpen(false)} className="btn btn-quiet w-full">
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
