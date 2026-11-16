import Link from 'next/link'
import React from 'react'

import { getSubjectTree } from '../../lib/catalogue'
import { Wordmark } from './Brand'
import { NewsletterForm } from './Forms'

/** Footer, set like a book's colophon. */
export const Footer: React.FC = async () => {
  const subjects = await getSubjectTree()
  return (
    <footer className="mt-24 border-t border-ink bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-12 md:grid-cols-[1.3fr_2fr]">
          <div>
            <Wordmark as="text" className="h-[20px]" />
            <p className="mt-5 max-w-sm font-serif text-[1.0625rem] leading-relaxed text-ink-soft">
              An independent bookshop for readers in Bangladesh. Every book we sell is a genuine publisher’s edition,
              chosen by people who read.
            </p>
            <div className="mt-8">
              <NewsletterForm />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {subjects.map((s) => (
              <div key={s.id}>
                <Link href={`/subjects/${s.slug}`} className="eyebrow !text-ink">
                  {s.name}
                </Link>
                <ul className="mt-3 space-y-1.5">
                  {s.children.map((c) => (
                    <li key={c.id}>
                      <Link href={`/subjects/${c.slug}`} className="text-[0.875rem] text-ink-soft hover:text-ink">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-12 flex flex-wrap gap-x-7 gap-y-2 border-t border-rule pt-6 text-[0.875rem]">
          {[
            ['Marginalia', '/marginalia'],
            ['Collections', '/collections'],
            ['Pre-orders', '/pre-orders'],
            ['Request a book', '/on-request'],
            ['Your account', '/account'],
            ['The Shelf', '/shelf'],
            ['About us', '/about'],
            ['Help', '/help'],
          ].map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="hover:underline hover:decoration-brass hover:underline-offset-4">
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3 border-t border-rule pt-6 text-[0.8125rem] text-ink-faint sm:flex-row sm:items-baseline sm:justify-between">
          <p>
            <span className="eyebrow mr-2 !text-ink-faint">Colophon</span>
            Set in Newsreader and Instrument Sans. Made in Dhaka.
          </p>
          <p>© {new Date().getFullYear()} AFTERWORD</p>
        </div>
      </div>
    </footer>
  )
}
