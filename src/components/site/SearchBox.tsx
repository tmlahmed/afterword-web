'use client'

import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'

import { formatTaka } from '../../lib/pricing'
import { SearchIcon } from './Brand'

type Hit = { id: number; title: string; slug: string; authorLine?: string | null; coverUrl?: string | null; price?: number | null; state: string }

const STATE: Record<string, string> = { in_stock: 'In stock', pre_order: 'Pre-order', on_request: 'On Request', unavailable: 'Out of print' }

/**
 * Search field with live suggestions. It is an ordinary form underneath, so pressing
 * Enter — or having no script at all — still takes you to the full results page.
 */
export const SearchBox: React.FC<{ variant?: 'line' | 'box'; autoFocus?: boolean }> = ({ variant = 'line', autoFocus }) => {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (res.ok) setHits(((await res.json()) as { hits: Hit[] }).hits)
      } catch {
        // Suggestions are a convenience; the form still works without them.
      }
    }, 160)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const show = open && q.trim().length >= 2

  return (
    <div ref={box} className="relative w-full">
      <form action="/search" role="search" onSubmit={() => setOpen(false)}>
        <label
          className={
            variant === 'line'
              ? 'flex h-11 items-center gap-2 border-b border-ink/70 px-1 focus-within:border-green'
              : 'flex h-12 items-center gap-2 border border-ink/70 bg-card px-3 focus-within:border-green'
          }
        >
          <SearchIcon className="shrink-0 text-ink-soft" />
          <span className="sr-only">Search</span>
          <input
            type="search"
            name="q"
            value={q}
            autoFocus={autoFocus}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="Title, author or ISBN"
            className="h-full w-full bg-transparent text-base placeholder:text-ink-faint focus:outline-none md:text-[0.9375rem]"
          />
        </label>
      </form>

      {show ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 border border-rule bg-card shadow-[0_24px_40px_-20px_rgb(26_29_27/0.4)]">
          {hits.length ? (
            <ul>
              {hits.map((h) => (
                <li key={h.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/book/${h.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-paper-deep">
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center">
                      {h.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.coverUrl} alt="" className="max-h-14 max-w-10 rounded-[1px] shadow-book" />
                      ) : (
                        <span className="h-14 w-9 bg-green" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[1rem] leading-snug">{h.title}</span>
                      <span className="block truncate text-[0.8125rem] text-ink-soft">{h.authorLine}</span>
                    </span>
                    <span className="shrink-0 text-right text-[0.8125rem]">
                      {h.price ? <span className="block font-semibold tabular-nums">{formatTaka(h.price)}</span> : null}
                      <span className="block text-ink-soft">{STATE[h.state] ?? ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-[0.875rem] text-ink-soft">No quick matches. Press Enter to search everything.</p>
          )}
          <Link
            href={`/search?q=${encodeURIComponent(q.trim())}`}
            onClick={() => setOpen(false)}
            className="block border-t border-ink px-3 py-2.5 text-[0.8125rem] font-semibold"
          >
            See all results for “{q.trim()}”
          </Link>
        </div>
      ) : null}
    </div>
  )
}
