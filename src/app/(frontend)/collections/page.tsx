import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { PageHeading } from '../../../components/site/PageHeading'
import { getLists } from '../../../lib/catalogue'

export const metadata: Metadata = { title: 'Collections' }

export default async function CollectionsPage() {
  const lists = await getLists()
  return (
    <>
      <PageHeading eyebrow="Browse" title="Collections" intro="Shelves put together by hand, each with a reason." />
      <ul className="mx-auto grid max-w-6xl gap-px border-y border-ink bg-rule px-0 sm:grid-cols-2 md:mx-auto">
        {lists.map((list) => (
          <li key={list.id} className="bg-paper">
            <Link href={`/collections/${list.slug}`} className="block px-4 py-7 hover:bg-card md:px-8">
              <h2 className="display text-[1.625rem]">{list.title}</h2>
              {list.intro ? <p className="mt-1 text-[0.9375rem] text-ink-soft">{list.intro}</p> : null}
              <p className="mt-3 text-[0.8125rem] text-ink-faint">{(list.books ?? []).length} books</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
