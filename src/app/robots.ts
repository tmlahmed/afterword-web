import type { MetadataRoute } from 'next'

import { siteUrl } from '../lib/notify'
import { indexingAllowed } from '../lib/seo'
import { generateSitemaps } from './sitemap'

// Read at request time, so ALLOW_INDEXING and the number of sitemap files are always current.
export const dynamic = 'force-dynamic'

/** Keep search engines to the shop's public pages. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl()
  // Only the live site should be indexed; staging and previews stay out of search results.
  if (!indexingAllowed()) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  const files = await generateSitemaps()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/bag', '/checkout', '/account', '/order/', '/desk/', '/pay/', '/shelf', '/search', '/suggest'],
    },
    sitemap: files.map((f) => `${base}/sitemap/${f.id}.xml`),
    host: base,
  }
}
