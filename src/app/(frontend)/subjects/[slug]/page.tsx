import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { Shelf } from '../../../../components/site/Books'
import { ArrowIcon } from '../../../../components/site/Brand'
import { FeaturedBook } from '../../../../components/site/Editorial'
import { PageHeading } from '../../../../components/site/PageHeading'
import { getSubjectLanding } from '../../../../lib/catalogue'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getSubjectLanding(slug)
  return { title: data?.subject.name ?? 'Subject not found', description: data?.subject.intro ?? undefined }
}

/** A subject's front page: an introduction and shelves, never a bare grid. The full grid is one tap away. */
export default async function SubjectPage({ params }: Props) {
  const { slug } = await params
  const data = await getSubjectLanding(slug)
  if (!data) notFound()
  const { subject, parent, children, shelves, feature, featureNote, total } = data
  const all = `/subjects/${subject.slug}/all`
  // Gifts & Stationery and its sections hold items, not books.
  const items = [subject.slug, parent?.slug].includes('gifts-stationery')
  const noun = items ? (total === 1 ? 'item' : 'items') : total === 1 ? 'book' : 'books'

  return (
    <>
      <PageHeading eyebrow={parent?.name ?? 'Browse'} title={subject.name} intro={subject.intro}>
        <ul className="mt-6 flex flex-wrap gap-2">
          {parent ? (
            <li>
              <Link href={`/subjects/${parent.slug}`} className="inline-block border rounded-ui border-rule px-3.5 py-1.5 text-[0.875rem] hover:border-ink">
                ← {parent.name}
              </Link>
            </li>
          ) : null}
          {children.map((c) => (
            <li key={c.id}>
              <Link href={`/subjects/${c.slug}`} className="inline-block border rounded-ui border-rule px-3.5 py-1.5 text-[0.875rem] hover:border-ink">
                {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href={all} className="inline-flex items-center gap-1.5 border rounded-ui border-ink px-3.5 py-1.5 text-[0.875rem] font-semibold">
              All {total} {noun} <ArrowIcon />
            </Link>
          </li>
        </ul>
      </PageHeading>

      <div className="space-y-14 md:space-y-20">
        {feature ? (
          <div className="mx-auto max-w-6xl px-4">
            <FeaturedBook book={feature} note={featureNote} eyebrow={`Our pick in ${subject.name}`} />
          </div>
        ) : null}
        {shelves.map((shelf) => (
          <Shelf key={shelf.title} {...shelf} />
        ))}
        <div className="mx-auto max-w-6xl px-4 text-center">
          <Link href={all} className="btn btn-quiet">
            Browse all {total} {noun} in {subject.name} <ArrowIcon />
          </Link>
        </div>
      </div>
    </>
  )
}
