import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { BookGrid } from '../../../../components/site/Books'
import { PageHeading } from '../../../../components/site/PageHeading'
import { type BookCardData, getAuthorPage } from '../../../../lib/catalogue'
import type { Media, Series } from '../../../../payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getAuthorPage(slug)
  return {
    title: data ? `${data.author.name} — books` : 'Author not found',
    description: data?.author.bio ?? (data ? `Books by ${data.author.name}, original editions from AFTERWORD.` : undefined),
  }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const data = await getAuthorPage(slug)
  if (!data) notFound()
  const { author, books } = data
  const portrait = typeof author.portrait === 'object' ? (author.portrait as Media | null) : null

  // Books in a series are grouped and put in reading order; the rest follow, newest first.
  const groups = new Map<number, { series: Series; books: typeof books }>()
  const single: typeof books = []
  for (const book of books) {
    const series = typeof book.series === 'object' ? (book.series as Series | null) : null
    if (!series) single.push(book)
    else groups.set(series.id, { series, books: [...(groups.get(series.id)?.books ?? []), book] })
  }
  for (const g of groups.values()) g.books.sort((a, b) => (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999))
  single.sort((a, b) => (b.publicationDate ?? '').localeCompare(a.publicationDate ?? ''))

  const roles = new Set(
    books.flatMap((b) =>
      (b.contributors ?? [])
        .filter((c) => (typeof c.contributor === 'object' ? c.contributor.id : c.contributor) === author.id)
        .map((c) => c.role),
    ),
  )
  const eyebrow = roles.has('author') ? 'Author' : roles.has('translator') ? 'Translator' : roles.has('illustrator') ? 'Illustrator' : 'Contributor'

  const jsonLd = { '@context': 'https://schema.org', '@type': 'Person', name: author.name, description: author.bio ?? undefined }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PageHeading eyebrow={eyebrow} title={author.name}>
        {author.bio || portrait ? (
          <div className="mt-5 flex max-w-3xl items-start gap-6">
            {portrait?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait.url} alt={portrait.alt ?? author.name} className="h-28 w-28 shrink-0 object-cover grayscale" />
            ) : null}
            {author.bio ? <p className="font-display text-[1.125rem] leading-relaxed text-ink-soft">{author.bio}</p> : null}
          </div>
        ) : null}
      </PageHeading>

      <div className="mx-auto max-w-6xl space-y-14 px-4">
        {[...groups.values()].map(({ series, books: inSeries }) => (
          <section key={series.id}>
            <div className="mb-6 flex items-end justify-between border-t border-ink pt-3">
              <h2 className="display text-[1.625rem]">{series.name}</h2>
              <Link href={`/series/${series.slug}`} className="text-[0.8125rem] font-semibold">
                The series →
              </Link>
            </div>
            <BookGrid books={inSeries as unknown as BookCardData[]} />
          </section>
        ))}
        {single.length ? (
          <section>
            <p className="mb-6 border-t border-ink pt-3 text-[0.8125rem] text-ink-soft">
              {groups.size ? 'Other books' : `${single.length} ${single.length === 1 ? 'book' : 'books'}`}
            </p>
            <BookGrid books={single as unknown as BookCardData[]} />
          </section>
        ) : null}
      </div>
    </>
  )
}
