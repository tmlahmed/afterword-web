import type { Metadata } from 'next'

/**
 * Shared metadata. Next.js replaces (rather than merges) a parent's openGraph and robots
 * when a page sets its own, so pages build theirs from these.
 */
export const indexingAllowed = () => process.env.ALLOW_INDEXING === 'true'

export const SHARE_DEFAULTS = { siteName: 'AFTERWORD', locale: 'en_BD' } as const

/** robots for a page: never indexed on staging, and optionally kept out on the live site too. */
export const robotsFor = (index = true): Metadata['robots'] =>
  indexingAllowed() && index ? { index: true, follow: true } : { index: false, follow: indexingAllowed() }
