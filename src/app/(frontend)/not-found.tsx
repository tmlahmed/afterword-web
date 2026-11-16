import Link from 'next/link'
import React from 'react'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="eyebrow">Page not found</p>
      <h1 className="display mt-3 text-[2.5rem]">This page is missing from our shelves.</h1>
      <p className="mt-4 text-ink-soft">The link may be old, or the book may no longer be listed.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Back to the shop
        </Link>
        <Link href="/search" className="btn btn-quiet">
          Search
        </Link>
      </div>
    </div>
  )
}
