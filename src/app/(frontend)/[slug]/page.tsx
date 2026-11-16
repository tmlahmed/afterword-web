import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { Shelf } from '../../../components/site/Books'
import { FeaturedBook, RichText } from '../../../components/site/Editorial'
import { PageHeading } from '../../../components/site/PageHeading'
import { getBooksByIds, getPage } from '../../../lib/catalogue'
import type { Edition, List, Note } from '../../../payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)
  return { title: page?.title ?? 'Page not found', description: page?.intro ?? undefined }
}

/** Pages built from blocks in the admin (Content → Pages): About, Help, Delivery and so on. */
export default async function BlockPage({ params }: Props) {
  const { slug } = await params
  const page = await getPage(slug)
  if (!page) notFound()

  const blocks = await Promise.all(
    (page.layout ?? []).map(async (block) => {
      if (block.blockType === 'text')
        return (
          <section key={block.id} className="mx-auto max-w-[44rem] px-4">
            {block.heading ? <h2 className="display mb-4 text-[1.875rem]">{block.heading}</h2> : null}
            <RichText data={block.body} />
          </section>
        )
      if (block.blockType === 'shelf' && typeof block.list === 'object') {
        const list = block.list as List
        const ids = (list.books ?? []).map((b) => (typeof b === 'object' ? b.id : b))
        return <Shelf key={block.id} title={block.title} intro={block.intro} href={`/collections/${list.slug}`} books={await getBooksByIds(ids, 12)} />
      }
      if (block.blockType === 'note' && typeof block.note === 'object') {
        const note = block.note as Note
        const book = typeof note.edition === 'object' ? (note.edition as Edition) : null
        return book ? (
          <div key={block.id} className="mx-auto max-w-6xl px-4">
            <FeaturedBook book={book} note={note} />
          </div>
        ) : null
      }
      if (block.blockType === 'questions')
        return (
          <section key={block.id} className="mx-auto max-w-[44rem] px-4">
            {block.heading ? <h2 className="display mb-2 text-[1.875rem]">{block.heading}</h2> : null}
            <div className="border-t border-ink">
              {block.items.map((item) => (
                <details key={item.id} className="group border-b border-rule">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 font-display text-[1.1875rem] [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span className="font-sans text-ink-soft group-open:hidden">+</span>
                    <span className="hidden font-sans text-ink-soft group-open:inline">−</span>
                  </summary>
                  <p className="whitespace-pre-line pb-5 text-ink-soft">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )
      return null
    }),
  )

  return (
    <>
      <PageHeading title={page.title} intro={page.intro} />
      <div className="space-y-12 md:space-y-16">{blocks}</div>
    </>
  )
}
