'use client'

import Link from 'next/link'
import React, { useEffect, useId, useRef, useState } from 'react'

import { formatTaka } from '../../lib/pricing'
import { SearchIcon } from './Brand'

type Hit = { id: number; title: string; slug: string; authorLine?: string | null; coverUrl?: string | null; price?: number | null; state: string }

const STATE: Record<string, string> = { in_stock: 'In stock', pre_order: 'Pre-order', on_request: 'On Request', unavailable: 'Out of print' }

/**
 * Search field with live suggestions. It is an ordinary form underneath, so pressing
 * Enter — or having no script at all — still takes you to the full results page.
 */
export const SearchBox: React.FC<{ variant?: 'line' | 'box'; autoFocus?: boolean; shortcut?: boolean }> = ({ variant = 'line', autoFocus, shortcut = false }) => {
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()

  // Press "/" anywhere (outside a text field) to jump to search, as on many reading sites.
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])
  // On phones the box sits in a fold-out panel: put the cursor in it as soon as it opens.
  useEffect(() => {
    const panel = input.current?.closest('details')
    if (!panel) return
    const onToggle = () => panel.open && input.current?.focus()
    panel.addEventListener('toggle', onToggle)
    return () => panel.removeEventListener('toggle', onToggle)
  }, [])

  const [hits, setHits] = useState<Hit[]>([])
  // Which search the hits belong to, so "no matches" is never shown while results are on their way.
  const [hitsFor, setHitsFor] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (res.ok) {
          setHits(((await res.json()) as { hits: Hit[] }).hits)
          setHitsFor(term)
        }
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
  const loading = hitsFor !== q.trim()

  return (
    <div ref={box} className="relative w-full">
      <form action="/search" role="search" onSubmit={() => setOpen(false)}>
        {/* One outlined box with the search button joined on the right. */}
        <div
          className={`group flex items-stretch rounded-ui border border-ink bg-paper transition-shadow focus-within:shadow-[0_0_0_3px_rgb(17_17_17/0.08)] ${
            variant === 'line' ? 'h-9' : 'h-12'
          }`}
        >
          <label htmlFor={inputId} className="sr-only">
            Search books
          </label>
          <input
            ref={input}
            id={inputId}
            type="search"
            name="q"
            value={q}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                input.current?.blur()
              }
            }}
            placeholder={variant === 'line' ? 'Title, author or ISBN' : 'Search by title, author or ISBN'}
            className={`h-full min-w-0 flex-1 bg-transparent text-base placeholder:text-ink-faint focus:outline-none [&::-webkit-search-cancel-button]:appearance-none ${variant === 'line' ? 'pl-3 md:text-[0.875rem]' : 'pl-3.5 md:text-[0.9375rem]'}`}
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('')
                setHits([])
                input.current?.focus()
              }}
              aria-label="Clear the search"
              className="flex w-9 shrink-0 items-center justify-center text-ink-faint hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          ) : shortcut ? (
            <kbd aria-hidden className="mr-2.5 hidden self-center rounded-ui border border-rule px-1.5 font-sans text-[0.75rem] leading-5 text-ink-faint md:inline-block">
              /
            </kbd>
          ) : null}
          <button
            type="submit"
            aria-label="Search"
            className={`-my-px -mr-px flex shrink-0 items-center justify-center rounded-r-ui bg-ink text-paper transition-colors hover:bg-accent focus-visible:bg-accent ${
              variant === 'line' ? 'w-9' : 'w-12'
            }`}
          >
            <SearchIcon className={variant === 'line' ? 'h-[18px] w-[18px]' : ''} />
          </button>
        </div>
      </form>

      {show ? (
        <div
          className={`absolute top-full z-50 mt-1.5 rounded-ui border border-ink bg-paper shadow-[0_24px_40px_-20px_rgb(17_17_17/0.35)] ${
            // The header box is compact; its suggestions get more room, lined up with its right edge.
            variant === 'line' ? 'right-0 w-[26rem] max-w-[calc(100vw-2rem)]' : 'inset-x-0'
          }`}
        >
          {loading && !hits.length ? (
            <p className="px-3 py-3 text-[0.875rem] text-ink-soft">Searching…</p>
          ) : hits.length ? (
            <ul className={loading ? 'opacity-60' : ''}>
              {hits.map((h) => (
                <li key={h.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/book/${h.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-paper-deep">
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center">
                      {h.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.coverUrl} alt="" className="max-h-14 max-w-10 rounded-[1px] shadow-book" />
                      ) : (
                        <span className="h-14 w-9 bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[1rem] leading-snug">{h.title}</span>
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
