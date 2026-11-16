import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { Browse } from '../../../components/site/Browse'
import { PageHeading } from '../../../components/site/PageHeading'
import { browse, parseBrowseParams, type RawParams } from '../../../lib/browse'
import { getSubjectTree } from '../../../lib/catalogue'
import { recordSearchMiss } from '../../../lib/searchMisses'
import config from '@payload-config'
import { getPayload } from 'payload'

type Props = { searchParams: Promise<RawParams> }

export const metadata: Metadata = { title: 'Search', robots: { index: false } }

export default async function SearchPage({ searchParams }: Props) {
  const raw = await searchParams
  const query = parseBrowseParams(raw)
  const [result, tree] = await Promise.all([query.q ? browse(query) : null, getSubjectTree()])
  const filtered = Object.entries(raw).some(([k, v]) => k !== 'q' && v)
  if (result && query.q && result.total === 0 && !filtered) recordSearchMiss(await getPayload({ config }), query.q)

  return (
    <>
      <PageHeading
        eyebrow="Search"
        title={query.q ? `“${query.q}”` : 'Search the shop'}
        intro={query.q ? null : 'Type a title, an author, a series or an ISBN in the box above.'}
      />
      {result ? (
        <Browse
          result={result}
          query={query}
          basePath="/search"
          params={raw}
          subjectOptions={tree.flatMap((s) => s.children.map((c) => ({ slug: c.slug, name: c.name })))}
          emptyMessage="Nothing on our shelves matches that. Check the spelling, or try the author’s name."
        />
      ) : null}
      {result && query.q ? (
        <p className="mx-auto mt-12 max-w-6xl px-4 text-center text-ink-soft">
          Not what you were looking for?{' '}
          <Link href={`/on-request?q=${encodeURIComponent(query.q)}`} className="link text-ink">
            Ask us to bring it in
          </Link>
          .
        </p>
      ) : null}
    </>
  )
}
