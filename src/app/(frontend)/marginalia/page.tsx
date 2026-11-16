import type { Metadata } from 'next'
import React from 'react'

import { Pager } from '../../../components/site/Books'
import { ArticleCard } from '../../../components/site/Editorial'
import { PageHeading } from '../../../components/site/PageHeading'
import { getArticles } from '../../../lib/catalogue'

export const metadata: Metadata = {
  title: 'Marginalia — the AFTERWORD journal',
  description: 'Reading lists, essays, interviews and extracts from the booksellers at AFTERWORD.',
}

type Props = { searchParams: Promise<{ page?: string }> }

export default async function MarginaliaPage({ searchParams }: Props) {
  const { page } = await searchParams
  const current = Math.max(1, Number(page) || 1)
  const articles = await getArticles(13, current)
  const [lead, ...rest] = articles.docs
  return (
    <>
      <PageHeading eyebrow="The journal" title="Marginalia" intro="Notes in the margin: what we are reading, and why you might." />
      <div className="mx-auto max-w-6xl px-4">
        {lead ? (
          <>
            {current === 1 ? (
              <div className="border-t border-ink pt-8">
                <ArticleCard article={lead} lead />
              </div>
            ) : null}
            <div className="mt-12 grid gap-x-8 gap-y-12 border-t border-rule pt-10 sm:grid-cols-2 lg:grid-cols-3">
              {(current === 1 ? rest : articles.docs).map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
            <Pager page={current} totalPages={articles.totalPages} hrefFor={(p) => `/marginalia?page=${p}`} />
          </>
        ) : (
          <p className="border-t border-ink py-16 text-center font-display text-[1.125rem] text-ink-soft">The first pieces are being written.</p>
        )}
      </div>
    </>
  )
}
