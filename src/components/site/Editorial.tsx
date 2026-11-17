import { RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import React from 'react'

import { availabilityOf } from '../../lib/availability'
import type { Article, Edition, Media, Note } from '../../payload-types'
import { AvailabilityMark, Cover, Price, tintFor } from './Books'
import { ArrowIcon } from './Brand'

type RichTextData = Parameters<typeof LexicalRichText>[0]['data']

/** Long-form text written in the admin's editor. */
export const RichText: React.FC<{ data: unknown; className?: string }> = ({ data, className = '' }) =>
  data ? <LexicalRichText data={data as RichTextData} className={`rich-text ${className}`} /> : null

const KIND: Record<string, string> = { list: 'Reading list', essay: 'Essay', interview: 'Interview', extract: 'Extract', news: 'News' }
export const kindLabel = (kind: string) => KIND[kind] ?? 'Marginalia'

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })

type ArticleCardData = Pick<Article, 'id' | 'title' | 'slug' | 'kind' | 'standfirst' | 'publishedAt' | 'byline' | 'image' | 'books'>

/** The picture for an article: its own image, or the covers of the first books it mentions. */
const ArticleArt: React.FC<{ article: ArticleCardData; tall?: boolean }> = ({ article, tall }) => {
  const image = typeof article.image === 'object' ? (article.image as Media | null) : null
  const books = (article.books ?? []).filter((b): b is Edition => typeof b === 'object').slice(0, 3)
  const height = tall ? 'h-[15rem] md:h-[22rem]' : 'h-[12rem]'
  if (image?.url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image.url} alt={image.alt ?? ''} className={`w-full object-cover ${height}`} />
  return (
    <div className={`flex items-end justify-center gap-3 overflow-hidden px-6 pt-6 ${height} ${tintFor(article.id)}`}>
      {books.map((b, i) => (
        <Cover key={b.id} title={b.title} src={b.coverUrl} className={`${tall ? 'h-[82%]' : 'h-[80%]'} translate-y-3 ${i === 1 ? 'translate-y-0' : ''}`} />
      ))}
    </div>
  )
}

export const ArticleCard: React.FC<{ article: ArticleCardData; lead?: boolean }> = ({ article, lead }) => (
  <Link href={`/marginalia/${article.slug}`} className={`group block ${lead ? 'md:grid md:grid-cols-[7fr_5fr] md:items-center md:gap-10' : ''}`}>
    <ArticleArt article={article} tall={lead} />
    <div className={lead ? 'pt-5 md:pt-0' : 'pt-4'}>
      <p className="eyebrow !text-accent">{kindLabel(article.kind)}</p>
      <h3 className={`display mt-2 group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4 ${lead ? 'text-[2rem] md:text-[2.75rem]' : 'text-[1.5rem]'}`}>
        {article.title}
      </h3>
      <p className={`mt-2 text-ink-soft ${lead ? 'font-display text-[1.125rem]' : 'line-clamp-3 text-[0.9375rem]'}`}>{article.standfirst}</p>
      <p className="mt-3 text-[0.8125rem] text-ink-faint">
        {[article.byline, formatDay(article.publishedAt)].filter(Boolean).join(' · ')}
      </p>
    </div>
  </Link>
)

/** A book shown large with its bookseller note: used for features and monthly picks. */
export const FeaturedBook: React.FC<{
  book: Edition | (Pick<Edition, 'id' | 'title' | 'slug' | 'authorLine' | 'coverUrl' | 'price' | 'compareAtPrice' | 'sourcing' | 'stockOnHand' | 'expectedDate' | 'leadTimeWeeks'>)
  note?: Note | null
  eyebrow?: string | null
  flip?: boolean
}> = ({ book, note, eyebrow, flip }) => (
  <div className="grid overflow-hidden border rounded-ui border-rule md:grid-cols-[4fr_8fr]">
    <Link href={`/book/${book.slug}`} className={`flex items-center justify-center px-8 py-9 ${tintFor(book.id)} ${flip ? 'md:order-2' : ''}`}>
      <Cover title={book.title} author={book.authorLine} src={book.coverUrl} className="h-[14rem] md:h-[17rem]" />
    </Link>
    <div className="flex flex-col justify-center px-5 py-7 md:px-10">
      {eyebrow ? <p className="eyebrow !text-accent">{eyebrow}</p> : null}
      <h3 className="display mt-2 text-[1.875rem] md:text-[2.375rem]">
        <Link href={`/book/${book.slug}`}>{book.title}</Link>
      </h3>
      {book.authorLine ? <p className="mt-1 font-display text-[1.125rem] text-ink-soft">{book.authorLine}</p> : null}
      {note ? (
        <figure className="mt-5 border-l border-accent pl-5">
          <blockquote className="font-display text-[1.0625rem] leading-relaxed">{note.body}</blockquote>
          <figcaption className="eyebrow mt-3">The Afterword · {note.signedBy}</figcaption>
        </figure>
      ) : null}
      <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-[0.9375rem]">
        <Link href={`/book/${book.slug}`} className="btn btn-primary">
          View the book <ArrowIcon />
        </Link>
        <Price price={book.price} was={book.compareAtPrice} showSaving className="text-[1.0625rem]" />
        <AvailabilityMark availability={availabilityOf(book)} className="text-ink-soft" />
      </p>
    </div>
  </div>
)
