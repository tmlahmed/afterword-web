import { NavHamburger, NavWrapper } from '@payloadcms/next/client'
import { Logout } from '@payloadcms/ui'
import type { Payload, ServerProps } from 'payload'
import React from 'react'

import { userHasRole } from '../../access/roles'
import type { IconName } from './icons'
import { AdminNavLinks, type NavGroupData } from './NavClient'

type Entry = { label: string; icon: IconName } & ({ collection: string } | { global: string })

/**
 * The menu, by how often each thing is used: selling first, settings last, and the rarely
 * needed screens last in their group. Each person sees only what their role allows.
 */
const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: 'Sell',
    entries: [
      { collection: 'orders', label: 'Orders', icon: 'orders' },
      { collection: 'requests', label: 'Book requests', icon: 'requests' },
      { collection: 'customers', label: 'Customers', icon: 'customers' },
      { collection: 'promotions', label: 'Promo codes', icon: 'promotions' },
      { collection: 'group-discounts', label: 'Group discounts', icon: 'pricing' },
      { collection: 'reward-entries', label: 'Reward points', icon: 'rewards' },
      { collection: 'messages', label: 'Messages sent', icon: 'messages' },
    ],
  },
  {
    label: 'Catalogue',
    entries: [
      { collection: 'editions', label: 'Books & items', icon: 'books' },
      { collection: 'contributors', label: 'Authors', icon: 'authors' },
      { collection: 'publishers', label: 'Publishers', icon: 'publishers' },
      { collection: 'series', label: 'Series', icon: 'series' },
      { collection: 'subjects', label: 'Subjects', icon: 'subjects' },
      { collection: 'catalogue-imports', label: 'Imports', icon: 'imports' },
      { collection: 'works', label: 'Works', icon: 'works' },
      { collection: 'search-misses', label: 'Searches with no results', icon: 'searches' },
    ],
  },
  {
    label: 'Stock',
    entries: [
      { collection: 'purchase-orders', label: 'Purchase orders', icon: 'purchases' },
      { collection: 'stock-lots', label: 'Stock lots', icon: 'series' },
      { collection: 'stock-movements', label: 'Stock movements', icon: 'movements' },
      { collection: 'suppliers', label: 'Suppliers', icon: 'suppliers' },
    ],
  },
  {
    label: 'Website',
    entries: [
      { global: 'home', label: 'Home page', icon: 'home' },
      { collection: 'lists', label: 'Collections', icon: 'collections' },
      { collection: 'notes', label: 'Bookseller notes', icon: 'notes' },
      { collection: 'articles', label: 'Marginalia', icon: 'marginalia' },
      { collection: 'reviews', label: 'Reviews', icon: 'reviews' },
      { collection: 'pages', label: 'Pages', icon: 'pages' },
      { global: 'navigation', label: 'Main menu', icon: 'menu' },
      { collection: 'media', label: 'Media', icon: 'media' },
      { collection: 'subscribers', label: 'Newsletter subscribers', icon: 'subscribers' },
    ],
  },
  {
    label: 'Settings',
    entries: [
      { global: 'site-settings', label: 'Shop settings', icon: 'settings' },
      { global: 'pricing', label: 'Pricing rules', icon: 'pricing' },
      { collection: 'users', label: 'Staff', icon: 'staff' },
    ],
  },
]

/** How many things are waiting on each list, shown beside its name. */
const waiting = async (payload: Payload, can: (slug: string) => boolean) => {
  const count = async (slug: 'orders' | 'requests' | 'reviews', where: object) =>
    can(slug) ? (await payload.count({ collection: slug, where: where as never, overrideAccess: true })).totalDocs : 0
  const [orders, requests, reviews] = await Promise.all([
    count('orders', { status: { in: ['placed', 'packing'] } }),
    count('requests', { status: { equals: 'new' } }),
    count('reviews', { status: { equals: 'pending' } }),
  ])
  return { orders, requests, reviews } as Record<string, number>
}

/** The admin's side menu, in place of Payload's plain list. */
export const AdminNav = async (props: ServerProps & { visibleEntities?: { collections: string[]; globals: string[] } }) => {
  const { payload, visibleEntities, user } = props
  const collections = new Set(visibleEntities?.collections ?? [])
  const globals = new Set(visibleEntities?.globals ?? [])
  const badges = await waiting(payload, (slug) => collections.has(slug))
  const known = new Set(GROUPS.flatMap((g) => g.entries.map((e) => ('collection' in e ? e.collection : e.global))))

  const groups: NavGroupData[] = GROUPS.map((g) => ({
    label: g.label,
    items: g.entries
      .filter((e) => ('collection' in e ? collections.has(e.collection) : globals.has(e.global)))
      .map((e) => {
        const slug = 'collection' in e ? e.collection : e.global
        return {
          href: 'collection' in e ? `/admin/collections/${slug}` : `/admin/globals/${slug}`,
          label: e.label,
          icon: e.icon,
          badge: badges[slug] || 0,
        }
      }),
  })).filter((g) => g.items.length)

  // Anything added later that is not placed in a group still shows, under "Other".
  const others = [...collections].filter((slug) => !known.has(slug))
  if (others.length) {
    groups.push({
      label: 'Other',
      items: others.map((slug) => ({ href: `/admin/collections/${slug}`, label: String(payload.config.collections.find((c) => c.slug === slug)?.labels?.plural ?? slug), icon: 'pages', badge: 0 })),
    })
  }

  return (
    <NavWrapper baseClass="nav">
      <nav className="nav__wrap aw-nav">
        <AdminNavLinks groups={groups} showReports={userHasRole(user, 'manager')} />
        <div className="aw-nav__foot">
          <a href="/" target="_blank" rel="noreferrer" className="aw-nav__link">
            <span className="aw-nav__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </span>
            <span className="aw-nav__label">View the shop</span>
          </a>
          <div className="nav__controls aw-nav__controls">
            <Logout />
          </div>
        </div>
      </nav>
      <div className="nav__header">
        <div className="nav__header-content">
          <NavHamburger baseClass="nav" />
        </div>
      </div>
    </NavWrapper>
  )
}
