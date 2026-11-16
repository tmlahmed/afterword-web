import type { Metadata } from 'next'
import React from 'react'

import { RequestForm } from '../../../components/site/Forms'
import { PageHeading } from '../../../components/site/PageHeading'
import { getSettings } from '../../../lib/catalogue'
import { getCustomer } from '../../../lib/session'

export const metadata: Metadata = {
  title: 'On Request — we will bring it in',
  description: 'Ask AFTERWORD for any book in print. We reply with a price and an arrival date before you pay.',
}

export default async function OnRequestPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, customer, settings] = await Promise.all([searchParams, getCustomer(), getSettings()])
  const weeks = settings.defaultLeadTimeWeeks ?? 4
  return (
    <>
      <PageHeading
        eyebrow="On Request"
        title="Can’t find it? We’ll bring it in."
        intro="If a book is in print anywhere, we can usually order it for you. Tell us what you are looking for."
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_20rem]">
        <RequestForm signedIn={Boolean(customer)} name={customer?.name} prefill={q} />
        <aside>
          <h2 className="eyebrow">How it works</h2>
          <ol className="mt-3 space-y-4 border-t border-ink pt-4 text-[0.9375rem]">
            <li>
              <strong className="font-semibold">1. You ask.</strong> <span className="text-ink-soft">Title and author is enough.</span>
            </li>
            <li>
              <strong className="font-semibold">2. We reply with a price and a date.</strong>{' '}
              <span className="text-ink-soft">By text message, usually within two working days.</span>
            </li>
            <li>
              <strong className="font-semibold">3. You order.</strong>{' '}
              <span className="text-ink-soft">
                Pay {settings.advancePercent ?? 50}% in advance and the rest on delivery. Most books arrive in about {weeks} to {weeks + 2} weeks.
              </span>
            </li>
          </ol>
        </aside>
      </div>
    </>
  )
}
