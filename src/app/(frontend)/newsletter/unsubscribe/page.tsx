import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { unsubscribe } from '../../../../lib/newsletter'

export const metadata: Metadata = { title: 'Newsletter', robots: { index: false } }

/** One click from the email: no sign-in, no "are you sure". */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const ok = await unsubscribe(await getPayload({ config }), String(t ?? ''))
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="eyebrow">Newsletter</p>
      <h1 className="display mt-3 text-[2.25rem]">{ok ? 'You are unsubscribed.' : 'That link has expired.'}</h1>
      <p className="mt-4 text-ink-soft">
        {ok ? 'We will not send you the newsletter again. Order messages still arrive by text.' : 'If you still get the newsletter, reply to it and we will take you off by hand.'}
      </p>
      <Link href="/" className="btn btn-primary mt-8">
        Back to the shop
      </Link>
    </div>
  )
}
