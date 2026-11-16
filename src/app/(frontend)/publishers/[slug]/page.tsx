import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { Browse } from '../../../../components/site/Browse'
import { PageHeading } from '../../../../components/site/PageHeading'
import { browse, parseBrowseParams, type RawParams } from '../../../../lib/browse'
import { getPublisher, getSubjectTree } from '../../../../lib/catalogue'
import type { Publisher } from '../../../../payload-types'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const publisher = await getPublisher(slug)
  return { title: publisher ? `${publisher.name} — books` : 'Publisher not found', description: publisher?.about ?? undefined }
}

export default async function PublisherPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams])
  const publisher = await getPublisher(slug)
  if (!publisher) notFound()
  const parent = typeof publisher.parent === 'object' ? (publisher.parent as Publisher | null) : null
  const query = parseBrowseParams(raw, { publisher: slug })
  const [result, tree] = await Promise.all([browse(query), getSubjectTree()])
  return (
    <>
      <PageHeading eyebrow={parent ? `An imprint of ${parent.name}` : 'Publisher'} title={publisher.name} intro={publisher.about} />
      <Browse
        result={result}
        query={query}
        basePath={`/publishers/${slug}`}
        params={raw}
        subjectOptions={tree.flatMap((s) => s.children.map((c) => ({ slug: c.slug, name: c.name })))}
      />
    </>
  )
}
