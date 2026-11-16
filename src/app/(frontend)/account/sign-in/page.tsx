import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import React from 'react'

import { SignInForm } from '../../../../components/site/Forms'
import { PageHeading } from '../../../../components/site/PageHeading'
import { getCustomer } from '../../../../lib/session'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = '/account' } = await searchParams
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/account'
  if (await getCustomer()) redirect(safe)
  return (
    <>
      <PageHeading eyebrow="Your account" title="Sign in with your phone" intro={safe === '/checkout' ? 'We confirm your number so we can reach you about your delivery.' : null} />
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-md">
          <SignInForm next={safe} />
        </div>
      </div>
    </>
  )
}
