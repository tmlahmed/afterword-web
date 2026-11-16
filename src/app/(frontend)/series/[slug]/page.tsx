import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { BookCard } from '../../../../components/site/Books'
import { PageHeading } from '../../../../components/site/PageHeading'
import { type BookCardData, getSeriesPage } from '../../../../lib/catalogue'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getSeriesPage(slug)
  return { title: data ? `${data.series.name} — in reading order` : 'Series not found', description: data?.series.about ?? undefined }
}

export default async function SeriesPage({ params }: Props) {
  const { slug } = await params
  const data = await getSeriesPage(slug)
  if (!data) notFound()
  const { series, books } = data
  return (
    <>
      <PageHeading eyebrow="Series" title={series.name} intro={series.about} />
      <div className="mx-auto max-w-6xl px-4">
        <p className="mb-6 border-t border-ink pt-3 text-[0.8125rem] text-ink-soft">
          {books.length} {books.length === 1 ? 'book' : 'books'} on our shelves, in reading order
        </p>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <li key={book.id}>
              {book.seriesNumber ? <p className="eyebrow mb-2 !text-accent">Book {book.seriesNumber}</p> : null}
              <BookCard book={book as unknown as BookCardData} />
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
