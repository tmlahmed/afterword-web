import type { Metadata } from 'next'
import React from 'react'

import { PageHeading } from '../../../components/site/PageHeading'
import { ShelfPage } from '../../../components/site/TheShelf'

export const metadata: Metadata = { title: 'The Shelf', robots: { index: false } }

type Props = { searchParams: Promise<{ books?: string }> }

export default async function Shelf({ searchParams }: Props) {
  const { books = '' } = await searchParams
  const shared = books
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200)
  return (
    <>
      <PageHeading
        eyebrow={shared.length ? 'Shared with you' : 'Saved books'}
        title="The Shelf"
        intro={shared.length ? 'Someone thought you might like these.' : 'Books you have set aside for later.'}
      />
      <div className="mx-auto max-w-6xl px-4">
        <ShelfPage shared={shared} />
      </div>
    </>
  )
}
