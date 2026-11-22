'use client'

import Image from 'next/image'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CloseIcon } from './Brand'
import { lockScroll } from '../../lib/scrollLock'

/** Interactive parts of the book page: the photo gallery, "Read more", and the phone buy bar. */

export type GalleryPhoto = { src: string; alt: string; width?: number | null; height?: number | null; caption?: string | null }

const Chevron: React.FC<{ dir: 'left' | 'right' }> = ({ dir }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)

/**
 * The cover and any extra photos. A row of thumbnails (down the side on wide screens, under the
 * photo on phones) picks the photo; on phones a swipe moves between them too. Clicking the
 * photo opens it full screen.
 */
export const BookGallery: React.FC<{ photos: GalleryPhoto[]; tint: string; fallback: React.ReactNode }> = ({ photos, tint, fallback }) => {
  const [at, setAt] = useState(0)
  const [open, setOpen] = useState(false)
  const touch = useRef<number | null>(null)
  const count = photos.length
  const go = useCallback((step: number) => setAt((i) => (i + step + count) % count), [count])
  const current = photos[at]

  return (
    <div>
      <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
        {count > 1 ? (
          <ul
            aria-label="Photos"
            className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:w-[4.5rem] md:shrink-0 md:flex-col md:overflow-visible [&::-webkit-scrollbar]:hidden"
          >
            {photos.map((p, i) => (
              <li key={p.src} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setAt(i)}
                  aria-label={`Photo ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}
                  aria-current={i === at ? 'true' : undefined}
                  className={`flex size-16 items-center justify-center overflow-hidden rounded-ui border p-1.5 transition md:size-[4.5rem] ${tint} ${
                    i === at ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <Image src={p.src} alt="" width={72} height={72} sizes="72px" className="max-h-full w-auto object-contain" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="group relative min-w-0 flex-1">
          <div
            // The cover sits on a tinted panel; other photos are shown whole, on white, so nothing is cropped.
            className={`flex aspect-[4/5] items-center justify-center overflow-hidden rounded-ui ${
              at === 0 || !current ? `px-10 py-10 sm:px-14 sm:py-12 ${tint}` : 'border border-rule bg-paper p-2'
            }`}
            onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const start = touch.current
              const end = e.changedTouches[0]?.clientX
              touch.current = null
              if (count > 1 && start !== null && end !== undefined && Math.abs(end - start) > 40) go(end < start ? 1 : -1)
            }}
          >
            {current ? (
              <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full cursor-zoom-in items-center justify-center" aria-label="Open this photo larger">
                <Image
                  key={current.src}
                  src={current.src}
                  alt={current.alt}
                  width={current.width ?? 600}
                  height={current.height ?? 900}
                  sizes="(min-width: 768px) 26rem, 80vw"
                  priority={at === 0}
                  className={at === 0 ? 'h-auto max-h-full w-auto max-w-full rounded-[2px] shadow-cover' : 'h-full w-full object-contain'}
                />
              </button>
            ) : (
              fallback
            )}
          </div>
          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex"
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex"
              >
                <Chevron dir="right" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      {current?.caption ? <p className={`mt-2 text-[0.8125rem] text-ink-soft ${count > 1 ? 'md:pl-[5.5rem]' : ''}`}>{current.caption}</p> : null}

      {open && current ? <Lightbox photos={photos} at={at} setAt={setAt} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

const Lightbox: React.FC<{ photos: GalleryPhoto[]; at: number; setAt: React.Dispatch<React.SetStateAction<number>>; onClose: () => void }> = ({ photos, at, setAt, onClose }) => {
  const count = photos.length
  const closeRef = useRef<HTMLButtonElement>(null)
  const touch = useRef<number | null>(null)
  const go = useCallback((step: number) => setAt((i) => (i + step + count) % count), [count, setAt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    const unlock = lockScroll()
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [go, onClose])

  const p = photos[at]
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photos of the book"
      onClick={onClose}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touch.current
        const end = e.changedTouches[0]?.clientX
        touch.current = null
        if (start !== null && end !== undefined && Math.abs(end - start) > 50) go(end < start ? 1 : -1)
      }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#111111] text-paper"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span />
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-full hover:bg-paper/10">
          <CloseIcon />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
        <Image
          key={p.src}
          src={p.src}
          alt={p.alt}
          width={p.width ?? 900}
          height={p.height ?? 1350}
          sizes="90vw"
          onClick={(e) => e.stopPropagation()}
          className="max-h-full w-auto max-w-full rounded-[2px] object-contain"
        />
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                go(-1)
              }}
              aria-label="Previous photo"
              className="absolute left-2 hidden size-11 items-center justify-center rounded-full bg-paper/10 hover:bg-paper/20 sm:flex"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                go(1)
              }}
              aria-label="Next photo"
              className="absolute right-2 hidden size-11 items-center justify-center rounded-full bg-paper/10 hover:bg-paper/20 sm:flex"
            >
              <Chevron dir="right" />
            </button>
          </>
        ) : null}
      </div>
      {p.caption ? <p className="px-4 pb-5 text-center text-[0.875rem] text-paper/80">{p.caption}</p> : null}
    </div>,
    document.body,
  )
}

/** Long text shortened to a few lines, with "Read more" when there is more to read. */
export const Expandable: React.FC<{ children: React.ReactNode; lines?: number; more?: string; less?: string; className?: string }> = ({
  children,
  lines = 6,
  more = 'Read more',
  less = 'Show less',
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={className}>
      <div
        ref={ref}
        className={open ? '' : 'overflow-hidden'}
        style={open ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }}
      >
        {children}
      </div>
      {overflows || open ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 text-[0.875rem] font-semibold underline underline-offset-4">
          {open ? less : more}
        </button>
      ) : null}
    </div>
  )
}

/**
 * On phones, once the buy box has scrolled away, a slim bar keeps the price and the button at
 * the bottom of the screen. It hides again when the buy box is back in view.
 */
export const StickyBuyBar: React.FC<{ watch: string; children: React.ReactNode }> = ({ watch, children }) => {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = document.getElementById(watch)
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [watch])
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 px-4 py-2.5 shadow-[0_-6px_20px_-12px_rgb(17_17_17/0.35)] backdrop-blur transition-transform duration-200 md:hidden ${
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
    >
      {children}
    </div>
  )
}
