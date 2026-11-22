import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { BookGrid } from '../../../../components/site/Books'
import { FeaturedBook } from '../../../../components/site/Editorial'
import { PageHeading } from '../../../../components/site/PageHeading'
import { getListPage, getNotesFor } from '../../../../lib/catalogue'
import { productHref } from '../../../../lib/links'

type Props = { params: Promise<{ slug: string }> }

const KIND: Record<string, string> = { theme: 'Collection', monthly: 'Monthly picks', prize: 'Prize list', gift: 'Gift guide' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getListPage(slug)
  return { title: data?.list.title ?? 'Collection not found', description: data?.list.intro ?? undefined }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const data = await getListPage(slug)
  if (!data) notFound()
  const { list, books } = data
  const notes = await getNotesFor(books.map((b) => b.id))

  // Books with a bookseller note are shown large, with the note; the rest follow as a grid.
  // Monthly picks show every book that way.
  const featured = books.filter((b) => notes.has(b.id)).slice(0, list.kind === 'monthly' ? 12 : 2)
  const featuredIds = new Set(featured.map((b) => b.id))
  const rest = books.filter((b) => !featuredIds.has(b.id))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: list.title,
    itemListElement: books.slice(0, 50).map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: `${productHref(b)}`, name: b.title })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PageHeading eyebrow={KIND[list.kind ?? 'theme']} title={list.title} intro={list.intro} />
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        {featured.map((book, i) => (
          <FeaturedBook key={book.id} book={book} note={notes.get(book.id)} flip={i % 2 === 1} />
        ))}
      </div>
      {rest.length ? (
        <div className="mx-auto mt-12 max-w-6xl px-4">
          <p className="mb-6 border-t border-ink pt-3 text-[0.8125rem] text-ink-soft">
            {featured.length ? 'Also in this collection' : `${rest.length} ${rest.length === 1 ? 'book' : 'books'}`}
          </p>
          <BookGrid books={rest} />
        </div>
      ) : null}
    </>
  )
}
