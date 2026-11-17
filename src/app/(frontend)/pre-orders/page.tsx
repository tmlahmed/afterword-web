import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { BookGrid } from '../../../components/site/Books'
import { PageHeading } from '../../../components/site/PageHeading'
import { getPreOrders } from '../../../lib/catalogue'

export const metadata: Metadata = { title: 'Pre-orders', description: 'Forthcoming books, with the date we expect them in Dhaka.' }

export default async function PreOrdersPage() {
  const books = await getPreOrders()
  return (
    <>
      <PageHeading eyebrow="Coming soon" title="Pre-orders" intro="Forthcoming books, in the order we expect them to reach Dhaka." />
      <div className="mx-auto max-w-6xl px-4">
        {books.length ? (
          <BookGrid books={books} />
        ) : (
          <div className="border rounded-ui border-rule px-6 py-14 text-center">
            <p className="font-display text-[1.25rem]">Nothing is open for pre-order today.</p>
            <p className="mx-auto mt-2 max-w-md text-ink-soft">New titles are added here as soon as publishers confirm their dates.</p>
            <Link href="/collections/new-and-notable" className="btn btn-primary mt-6">
              See what is new
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
