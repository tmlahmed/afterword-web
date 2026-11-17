'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import type { BookCardData } from '../../lib/catalogue'
import { BookCard } from './Books'
import { ShelfIcon } from './Brand'

/**
 * The Shelf: a reader's saved books.
 * Until customer accounts arrive (phase 3) the list lives in this browser. It can be shared
 * as a link, and will be moved into the account automatically at first sign-in.
 */
const KEY = 'afterword.shelf'
const EVENT = 'afterword:shelf'

const read = (): number[] => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}
const write = (ids: number[]) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 200)))
  } catch {
    // Private browsing: the shelf simply will not persist.
  }
  window.dispatchEvent(new Event(EVENT))
}

let cache: { raw: string; ids: number[] } = { raw: '[]', ids: [] }
const snapshot = (): number[] => {
  let raw = '[]'
  try {
    raw = window.localStorage.getItem(KEY) ?? '[]'
  } catch {
    // ignore
  }
  if (raw !== cache.raw) cache = { raw, ids: read() }
  return cache.ids
}
const EMPTY: number[] = []
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}
const useShelf = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY)

export const ShelfButton: React.FC<{ id: number; title: string }> = ({ id, title }) => {
  const ids = useShelf()
  const on = ids.includes(id)
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => write(on ? ids.filter((i) => i !== id) : [id, ...ids])}
      className="btn btn-quiet w-full"
      aria-label={on ? `Remove ${title} from The Shelf` : `Save ${title} to The Shelf`}
    >
      <ShelfIcon className={on ? 'fill-current' : ''} />
      {on ? 'On your Shelf' : 'Save to The Shelf'}
    </button>
  )
}

export const ShelfLink: React.FC = () => {
  const count = useShelf().length
  return (
    <Link href="/shelf" aria-label={`The Shelf, ${count} saved`} className="relative hidden h-11 w-11 items-center justify-center sm:flex">
      <ShelfIcon />
      {count ? (
        <span className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-paper">
          {count}
        </span>
      ) : null}
    </Link>
  )
}

export const ShelfPage: React.FC<{ shared: number[] }> = ({ shared }) => {
  const mine = useShelf()
  const viewingShared = shared.length > 0
  const ids = viewingShared ? shared : mine
  const [fetched, setFetched] = useState<{ key: string; books: BookCardData[] } | null>(null)
  const [copied, setCopied] = useState(false)
  const key = ids.join(',')

  useEffect(() => {
    if (!key) return
    let live = true
    fetch(`/shelf/books?ids=${key}`)
      .then((r) => (r.ok ? r.json() : { books: [] }))
      .then((d: { books: BookCardData[] }) => live && setFetched({ key, books: d.books }))
      .catch(() => live && setFetched({ key, books: [] }))
    return () => {
      live = false
    }
  }, [key])

  // Nothing saved: empty at once. Otherwise show the last answer that matches what is saved now.
  const books = !key ? [] : fetched?.key === key ? fetched.books : null

  const share = useCallback(async () => {
    const link = `${window.location.origin}/shelf?books=${mine.join(',')}`
    try {
      if (navigator.share) await navigator.share({ title: 'My Shelf at AFTERWORD', url: link })
      else {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      // Sharing was cancelled.
    }
  }, [mine])

  if (books === null) return <p className="py-16 text-center text-ink-soft">Fetching your books…</p>

  if (books.length === 0)
    return (
      <div className="border rounded-ui border-rule px-6 py-14 text-center">
        <p className="font-display text-[1.25rem]">Your Shelf is empty.</p>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          Tap “Save to The Shelf” on any book to keep it here for later. No account needed.
        </p>
        <Link href="/collections/new-and-notable" className="btn btn-primary mt-6">
          Find something to read
        </Link>
      </div>
    )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink pt-3">
        <p className="text-[0.8125rem] text-ink-soft">
          {books.length} {books.length === 1 ? 'book' : 'books'}
          {viewingShared ? ' on a shared Shelf' : ' saved on this device'}
        </p>
        {viewingShared ? (
          <button type="button" className="link text-[0.875rem] font-semibold" onClick={() => write([...new Set([...shared, ...mine])])}>
            Save all to my Shelf
          </button>
        ) : (
          <button type="button" className="link text-[0.875rem] font-semibold" onClick={share}>
            {copied ? 'Link copied' : 'Share this Shelf'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {books.map((book) => (
          <div key={book.id}>
            <BookCard book={book} />
            {!viewingShared ? (
              <button
                type="button"
                className="mt-2 text-[0.8125rem] text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                onClick={() => write(mine.filter((i) => i !== book.id))}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  )
}
