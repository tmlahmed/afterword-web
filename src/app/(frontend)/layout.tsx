import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Newsreader } from 'next/font/google'
import React from 'react'

import { Footer } from '../../components/site/Footer'
import { Header } from '../../components/site/Header'
import { siteUrl } from '../../lib/notify'
import { robotsFor, SHARE_DEFAULTS } from '../../lib/seo'
import './globals.css'

const serif = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
})
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' })

const DESCRIPTION =
  'An independent bookshop for readers in Bangladesh. Genuine publishers’ editions, chosen by booksellers, with honest delivery dates.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'AFTERWORD — Original books, delivered across Bangladesh', template: '%s · AFTERWORD' },
  description: DESCRIPTION,
  applicationName: 'AFTERWORD',
  alternates: { canonical: './' },
  openGraph: { ...SHARE_DEFAULTS, type: 'website', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
  // Staging and preview copies are never indexed; see robots.ts.
  robots: robotsFor(),
}

export const viewport: Viewport = { themeColor: '#f6f1e7', width: 'device-width', initialScale: 1 }

// Pages read live prices and stock. Caching rules are set in the launch-hardening phase.
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <Header />
        <main id="content">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
