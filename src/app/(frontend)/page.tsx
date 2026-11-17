import Link from 'next/link'
import React from 'react'

import { AvailabilityMark, Cover, Price, Shelf, tintFor } from '../../components/site/Books'
import { ArrowIcon } from '../../components/site/Brand'
import { availabilityOf } from '../../lib/availability'
import { ArticleCard } from '../../components/site/Editorial'
import { JsonLd } from '../../components/site/JsonLd'
import { getArticles, getHome, getSettings } from '../../lib/catalogue'
import { siteUrl } from '../../lib/notify'

const PROMISES = [
  { title: 'Original, always', body: 'Every book is a genuine publisher’s edition.' },
  { title: 'Honest dates', body: 'In stock, pre-order or on request — we say which, and when.' },
  { title: 'Chosen by readers', body: 'Shelves picked and explained by booksellers.' },
]

export default async function HomePage() {
  const [home, settings, articles] = await Promise.all([getHome(), getSettings(), getArticles(3)])
  const { feature, featureNote, shelves, quote } = home
  const [firstShelf, ...otherShelves] = shelves
  // The pull-quote sits after the second remaining shelf, or at the end if there are few.
  const quoteAfter = Math.min(1, otherShelves.length - 1)

  const site = siteUrl()
  const organisation = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': ['Organization', 'BookStore'], '@id': `${site}/#shop`, name: 'AFTERWORD', url: site, areaServed: 'BD', currenciesAccepted: 'BDT' },
      {
        '@type': 'WebSite',
        '@id': `${site}/#website`,
        url: site,
        name: 'AFTERWORD',
        publisher: { '@id': `${site}/#shop` },
        potentialAction: { '@type': 'SearchAction', target: `${site}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      },
    ],
  }

  return (
    <>
      <JsonLd data={organisation} />
      {/* The featured book: a framed panel within the page width, cover on the left. */}
      {feature ? (
        <section className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
          <div className="grid overflow-hidden border rounded-ui border-rule md:grid-cols-[3fr_5fr]">
            <Link
              href={`/book/${feature.slug}`}
              className={`flex items-center justify-center px-8 py-10 md:px-6 md:py-12 lg:px-10 lg:py-14 ${tintFor(feature.id)}`}
            >
              <Cover
                title={feature.title}
                author={feature.authorLine}
                src={feature.coverUrl}
                priority
                sizes="(min-width: 1024px) 15rem, (min-width: 768px) 12rem, 12rem"
                className="h-[16rem] md:h-[17rem] lg:h-[21rem]"
              />
            </Link>
            <div className="flex flex-col justify-center border-t border-rule px-5 py-8 md:border-l md:border-t-0 md:px-8 md:py-12 lg:px-12 lg:py-14">
              <p className="eyebrow !text-accent">{home.eyebrow || 'Book of the Month'}</p>
              <h1 className="display mt-3 text-[2.25rem] md:text-[2.625rem] lg:text-[3.25rem]">
                <Link href={`/book/${feature.slug}`}>{feature.title}</Link>
              </h1>
              {feature.authorLine ? <p className="mt-2 font-display text-[1.1875rem] text-ink-soft">{feature.authorLine}</p> : null}

              {featureNote ? (
                <figure className="mt-6 max-w-xl border-l-2 border-accent pl-5">
                  <blockquote className="font-display text-[1.0625rem] leading-relaxed md:text-[1.125rem]">{featureNote.body}</blockquote>
                  <figcaption className="eyebrow mt-3">The Afterword · {featureNote.signedBy}</figcaption>
                </figure>
              ) : null}

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href={`/book/${feature.slug}`} className="btn btn-primary">
                  View the book <ArrowIcon />
                </Link>
                <p className="flex items-baseline gap-4 text-[0.9375rem]">
                  <Price price={feature.price} was={feature.compareAtPrice} showSaving className="text-[1.0625rem]" />
                  <AvailabilityMark availability={availabilityOf(feature, settings)} className="text-ink-soft" />
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Three promises, framed to match the panel above. */}
      <section aria-label="Our promises" className={`mx-auto max-w-6xl px-4 ${feature ? 'mt-4 md:mt-5' : 'pt-6 md:pt-10'}`}>
        <ul className="grid divide-y divide-rule border rounded-ui border-rule md:grid-cols-3 md:divide-x md:divide-y-0">
          {PROMISES.map((p) => (
            <li key={p.title} className="px-5 py-4 md:px-8 md:py-6">
              <p className="font-display text-[1.0625rem]">{p.title}</p>
              <p className="mt-0.5 text-[0.875rem] text-ink-soft">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 space-y-14 md:mt-16 md:space-y-20">
        {firstShelf ? <Shelf {...firstShelf} /> : null}

        {otherShelves.map((shelf, i) => (
          <React.Fragment key={shelf.title}>
            <Shelf {...shelf} />
            {quote && i === quoteAfter ? (
              <section className="bg-ink text-paper">
                <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 md:grid-cols-[auto_1fr] md:gap-16 md:py-20">
                  <Link href={`/book/${quote.book.slug}`} className="justify-self-start">
                    <Cover
                      title={quote.book.title}
                      author={quote.book.authorLine}
                      src={quote.book.coverUrl}
                      className="h-[13rem] md:h-[17rem]"
                    />
                  </Link>
                  <figure>
                    <p className="eyebrow !text-accent">The Afterword</p>
                    <blockquote className="display mt-4 text-[1.625rem] leading-[1.25] md:text-[2.25rem]">
                      “{quote.note.body}”
                    </blockquote>
                    <figcaption className="mt-6 text-[0.9375rem] text-paper/75">
                      {quote.note.signedBy}, on{' '}
                      <Link href={`/book/${quote.book.slug}`} className="link text-paper">
                        {quote.book.title}
                      </Link>
                      {quote.book.authorLine ? ` by ${quote.book.authorLine}` : ''}
                    </figcaption>
                  </figure>
                </div>
              </section>
            ) : null}
          </React.Fragment>
        ))}

        {articles.docs.length ? (
          <section className="mx-auto max-w-6xl px-4">
            <div className="flex items-end justify-between gap-6 border-t border-ink pt-4">
              <div>
                <h2 className="display text-[1.75rem] md:text-[2.125rem]">From Marginalia</h2>
                <p className="mt-1 text-[0.9375rem] text-ink-soft">Notes in the margin: what we are reading, and why you might.</p>
              </div>
              <Link href="/marginalia" className="hidden shrink-0 items-center gap-1.5 pb-1 text-[0.8125rem] font-semibold sm:inline-flex">
                The journal <ArrowIcon />
              </Link>
            </div>
            <div className="mt-7 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {articles.docs.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-6xl px-4">
          <div className="border rounded-ui border-ink px-6 py-10 text-center md:py-14">
            <p className="eyebrow">On Request</p>
            <h2 className="display mx-auto mt-3 max-w-2xl text-[1.875rem] md:text-[2.5rem]">
              Can’t find it? We’ll bring it in.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-soft">
              If a book is in print anywhere, we can usually order it for you, with a clear price and arrival date
              before you pay.
            </p>
            <Link href="/on-request" className="btn btn-quiet mt-6">
              Request a book <ArrowIcon />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
