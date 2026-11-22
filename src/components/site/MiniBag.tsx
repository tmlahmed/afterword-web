'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useCallback, useEffect, useId, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { setQuantity } from '../../app/(frontend)/actions'
import { formatTaka } from '../../lib/pricing'
import { BagIcon, CloseIcon } from './Brand'
import { QtyStepper } from './QtyStepper'
import { lockScroll } from '../../lib/scrollLock'

export type MiniBagLine = {
  id: number
  title: string
  slug: string
  /** The book's or item's page. */
  href: string
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

/** Fired by the buy button after a book is added, with `{ edition }`, so the bag opens to show it. */
export const BAG_ADDED_EVENT = 'afterword:bag-added'

const noSubscribe = () => () => {}

const TruckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M3 6.5h11v9H3zM14 9.5h3.5l3 3v3H14" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 8.5 3 3 7-7" />
  </svg>
)

/**
 * The bag in the header. Clicking the icon, or adding a book anywhere, slides the bag in from the
 * right; it stays until the shopper closes it (the ×, a click on the page behind, or Escape).
 * A book just added is shown first and marked. Without JavaScript the icon links to the bag page.
 */
export const MiniBag: React.FC<{ data: MiniBagData }> = ({ data }) => {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  // True in the browser only, so the drawer is placed on the page after it loads.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const [pending, startTransition] = useTransition()
  // Quantities change on screen at once; the server's answer replaces them a moment later.
  const [lines, setOptimisticQty] = useOptimistic(data.lines, (current, change: { id: number; quantity: number }) =>
    change.quantity <= 0 ? current.filter((l) => l.id !== change.id) : current.map((l) => (l.id === change.id ? { ...l, quantity: change.quantity } : l)),
  )
  const panelId = useId()
  const trigger = useRef<HTMLAnchorElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  // How the shopper last acted: with the keyboard, or with a mouse or finger.
  const usedKeyboard = useRef(false)
  useEffect(() => {
    const key = () => (usedKeyboard.current = true)
    const pointer = () => (usedKeyboard.current = false)
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', pointer, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', pointer, true)
    }
  }, [])

  // Closed by the shopper (×, Escape, the page behind, Continue shopping). Keyboard users get
  // focus back on the bag icon, outlined so they can see where they are; after a click or tap
  // nothing is focused, so no outline is left on the icon.
  const close = useCallback(() => {
    setOpen(false)
    setAdded(null)
    if (usedKeyboard.current) trigger.current?.focus({ preventScroll: true })
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])
  // Closed by following a link to another page: let go of focus, so no browser hands it to a
  // field on the next page (the bag page's promotion code box, for one).
  const leave = useCallback(() => {
    setOpen(false)
    setAdded(null)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])

  // A book was added anywhere on the page: open, showing it first.
  useEffect(() => {
    const onAdded = (e: Event) => {
      const edition = (e as CustomEvent<{ edition?: number }>).detail?.edition
      setAdded(typeof edition === 'number' ? edition : null)
      setOpen(true)
    }
    window.addEventListener(BAG_ADDED_EVENT, onAdded)
    return () => window.removeEventListener(BAG_ADDED_EVENT, onAdded)
  }, [])

  // While open: Escape closes, Tab stays inside the panel, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key !== 'Tab' || !panel.current) return
      const items = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const unlock = lockScroll()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [open, close])

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
  const justAdded = added ? lines.find((l) => l.id === added) : undefined
  // The book just added comes first.
  const shown = justAdded ? [justAdded, ...lines.filter((l) => l.id !== justAdded.id)] : lines

  const drawer = (
    <div className={`fixed inset-0 z-[90] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open} inert={!open}>
      {/* The page behind, dimmed; a click on it closes the bag. */}
      <div onClick={close} className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />

      <div
        ref={panel}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        // The shadow only while open: closed, the panel waits just off screen and its shadow
        // would otherwise fall along the right edge of every page.
        className={`absolute inset-y-0 right-0 flex w-[min(26.5rem,92vw)] flex-col bg-paper transition-[transform,box-shadow,visibility] duration-300 ease-out ${
          open ? 'visible translate-x-0 shadow-[-24px_0_48px_-24px_rgb(17_17_17/0.45)]' : 'invisible translate-x-full shadow-none'
        }`}
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <p className="display text-[1.375rem]">
            Your bag{count ? <span className="ml-2 font-sans text-[0.875rem] text-ink-soft">{count} {count === 1 ? 'book' : 'books'}</span> : null}
          </p>
          <button ref={closeBtn} type="button" onClick={close} aria-label="Close the bag" className="-mr-2 flex size-10 items-center justify-center rounded-full hover:bg-paper-deep">
            <CloseIcon />
          </button>
        </div>

        {justAdded ? (
          <p role="status" className="flex items-center gap-2 bg-ink px-5 py-2.5 text-[0.875rem] text-paper">
            <CheckIcon />
            <span className="truncate">
              Added to your bag: <span className="font-medium">{justAdded.title}</span>
            </span>
          </p>
        ) : null}

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <BagIcon />
            <p className="mt-3 font-display text-[1.125rem]">Your bag is empty</p>
            <Link href="/collections" onClick={leave} className="btn btn-primary mt-5">
              Find something to read
            </Link>
          </div>
        ) : (
          <>

            <ul className="min-h-0 flex-1 overflow-y-auto px-5">
              {shown.map((l) => (
                <li key={l.id} className={`flex gap-3.5 border-b border-rule py-4 last:border-b-0 ${l.id === added ? 'animate-[fadeIn_.4s_ease-out]' : ''}`}>
                  <Link href={l.href} onClick={leave} className="shrink-0">
                    {l.coverUrl ? (
                      <Image src={l.coverUrl} alt="" width={56} height={84} sizes="56px" className="h-[5.25rem] w-auto max-w-[3.5rem] rounded-[2px] object-contain shadow-cover" />
                    ) : (
                      <span className="block h-[5.25rem] w-14 rounded-[2px] bg-primary" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={l.href} onClick={leave} className="line-clamp-2 font-display text-[1.0625rem] leading-snug hover:underline">
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

            <div className="border-t border-rule px-5 pt-4 pb-5">
              {freeAbove > 0 ? (
                <div className="mb-4 rounded-ui bg-paper-deep px-3.5 py-3">
                  {freeShortfall > 0 ? (
                    <>
                      <p className="flex items-center gap-2 text-[0.875rem]">
                        <TruckIcon />
                        <span>
                          Add <strong className="tabular-nums">{formatTaka(freeShortfall)}</strong> more for <strong>free delivery</strong>
                        </span>
                      </p>
                      <div
                        role="progressbar"
                        aria-label="Towards free delivery"
                        aria-valuemin={0}
                        aria-valuemax={freeAbove}
                        aria-valuenow={freeAbove - freeShortfall}
                        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-paper"
                      >
                        <div
                          className="h-full rounded-full bg-ink transition-[width] duration-500"
                          style={{ width: `${Math.min(100, Math.max(4, Math.round(((freeAbove - freeShortfall) / freeAbove) * 100)))}%` }}
                        />
                      </div>
                      <p className="mt-1.5 flex justify-between text-[0.6875rem] text-ink-faint tabular-nums">
                        <span>{formatTaka(freeAbove - freeShortfall)}</span>
                        <span>Free at {formatTaka(freeAbove)}</span>
                      </p>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-[0.875rem] font-medium">
                      <span className="flex size-5 items-center justify-center rounded-full bg-ink text-paper">
                        <CheckIcon />
                      </span>
                      Free delivery, anywhere in Bangladesh
                    </p>
                  )}
                </div>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span>
                  Subtotal <span className="text-[0.875rem] text-ink-soft">({count} {count === 1 ? 'book' : 'books'})</span>
                </span>
                <span className="font-display text-[1.375rem] tabular-nums">{formatTaka(subtotal)}</span>
              </div>
              <p className="mt-0.5 text-[0.8125rem] text-ink-soft">Delivery and promotion codes on the next step.</p>
              {/* The bag comes first: gift wrap, promotion codes and the full totals are there. */}
              <Link href="/bag" onClick={leave} className="btn btn-primary mt-4 w-full">
                View bag
              </Link>
              <Link href="/checkout" onClick={leave} className="btn btn-quiet mt-2 w-full">
                Checkout
              </Link>
              <button type="button" onClick={close} className="mt-3 block w-full text-center text-[0.875rem] font-medium underline underline-offset-4">
                Continue shopping
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="-mr-2">
      <Link
        ref={trigger}
        href="/bag"
        aria-label={`Your bag, ${count} ${count === 1 ? 'book' : 'books'}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={(e) => {
          // Opens the bag beside the page; the full bag page is one click away inside it.
          e.preventDefault()
          if (!usedKeyboard.current) e.currentTarget.blur()
          setAdded(null)
          setOpen(true)
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
      {mounted ? createPortal(drawer, document.body) : null}
    </div>
  )
}
