import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { Shelf } from '../../../../components/site/Books'
import { formatDay, kindLabel, RichText } from '../../../../components/site/Editorial'
import { type BookCardData, getArticle } from '../../../../lib/catalogue'
import type { Edition, Media } from '../../../../payload-types'
import { SHARE_DEFAULTS } from '../../../../lib/seo'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) return { title: 'Article not found' }
  const image = typeof article.image === 'object' ? (article.image as Media | null)?.url : undefined
  return {
    title: article.title,
    description: article.standfirst,
    openGraph: { ...SHARE_DEFAULTS, title: article.title, description: article.standfirst, type: 'article', images: image ? [image] : undefined },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()
  const books = (article.books ?? []).filter((b): b is Edition => typeof b === 'object' && b.status === 'published')
  const image = typeof article.image === 'object' ? (article.image as Media | null) : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.standfirst,
    datePublished: article.publishedAt,
    author: article.byline ? { '@type': 'Person', name: article.byline } : { '@type': 'Organization', name: 'AFTERWORD' },
    publisher: { '@type': 'Organization', name: 'AFTERWORD' },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <article>
        <header className="mx-auto max-w-[44rem] px-4 pb-8 pt-10 md:pt-16">
          <p className="eyebrow">
            <Link href="/marginalia" className="hover:text-ink">
              Marginalia
            </Link>{' '}
            · <span className="text-green">{kindLabel(article.kind)}</span>
          </p>
          <h1 className="display mt-3 text-[2.5rem] md:text-[3.75rem]">{article.title}</h1>
          <p className="mt-4 font-serif text-[1.3125rem] leading-snug text-ink-soft">{article.standfirst}</p>
          <p className="mt-5 border-t border-rule pt-3 text-[0.8125rem] text-ink-faint">
            {[article.byline, formatDay(article.publishedAt)].filter(Boolean).join(' · ')}
          </p>
        </header>
        {image?.url ? (
          <div className="mx-auto max-w-5xl px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt ?? ''} className="max-h-[32rem] w-full object-cover" />
          </div>
        ) : null}
        <div className="mx-auto max-w-[44rem] px-4 pt-8">
          <RichText data={article.body} />
        </div>
      </article>
      {books.length ? (
        <div className="mt-16">
          <Shelf title="Books in this piece" books={books as unknown as BookCardData[]} />
        </div>
      ) : null}
    </>
  )
}
