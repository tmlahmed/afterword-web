import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { Browse } from '../../../../../components/site/Browse'
import { PageHeading } from '../../../../../components/site/PageHeading'
import { browse, parseBrowseParams, type RawParams } from '../../../../../lib/browse'
import { getSubjectLanding } from '../../../../../lib/catalogue'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getSubjectLanding(slug)
  return { title: data ? `All ${data.subject.name}` : 'Subject not found', robots: { index: false, follow: true } }
}

export default async function SubjectAllPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams])
  const data = await getSubjectLanding(slug)
  if (!data) notFound()
  const query = parseBrowseParams(raw, { subject: slug })
  const result = await browse(query)
  return (
    <>
      <PageHeading eyebrow={data.parent?.name ?? 'Browse'} title={`All ${data.subject.name}`} />
      <Browse
        result={result}
        query={query}
        basePath={`/subjects/${slug}/all`}
        params={raw}
        subjectOptions={data.children.map((c) => ({ slug: c.slug, name: c.name }))}
      />
    </>
  )
}
