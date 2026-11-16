import Link from 'next/link'
import React from 'react'

import { getBag } from '../../lib/bag'
import { getNavigation, getSettings } from '../../lib/catalogue'
import { CloseIcon, MenuIcon, SearchIcon, Wordmark } from './Brand'
import { Cover } from './Books'
import { MiniBag, type MiniBagData } from './MiniBag'
import { SearchBox } from './SearchBox'
import { ShelfLink } from './TheShelf'

/**
 * Site header. The menu is arranged in the admin (Content → Main menu).
 * Menus open with <details> on phones and on hover or keyboard focus on desktop,
 * so navigation works before any script loads.
 */
export const Header: React.FC = async () => {
  const [settings, nav, bag] = await Promise.all([getSettings(), getNavigation(), getBag()])
  const inside = bag.totals('inside_dhaka')
  const miniBag: MiniBagData = {
    count: bag.count,
    subtotal: inside.subtotal,
    discount: inside.discount,
    freeAbove: bag.rules.freeDeliveryAbove,
    freeShortfall: inside.freeDeliveryShortfall,
    lines: bag.lines.map((l) => ({
      id: l.edition.id,
      title: l.edition.title,
      slug: l.edition.slug,
      authorLine: l.edition.authorLine,
      coverUrl: l.edition.coverUrl,
      unitPrice: l.edition.price ?? 0,
      quantity: l.quantity,
      // In-stock books are limited to the copies on hand; others to what an order allows.
      max: l.kind === 'in_stock' ? Math.min(20, l.edition.stockOnHand ?? 0) : 20,
      note: l.note,
      problem: l.problem,
    })),
  }

  return (
    <>
      {settings.announcement ? (
        <p className="bg-ink px-4 py-2 text-center text-[0.75rem] tracking-wide text-paper">{settings.announcement}</p>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur">
        <div className="relative mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] md:grid-cols-[auto_1fr] items-center px-4 md:h-[4.5rem]">
          {/* Left: menu (phones) */}
          <div className="flex items-center gap-1 md:hidden">
            <details className="group">
              <summary
                className="-ml-2 flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
                aria-label="Menu"
              >
                <MenuIcon className="group-open:hidden" />
                <CloseIcon className="hidden group-open:block" />
              </summary>
              <nav
                aria-label="Main"
                className="absolute inset-x-0 top-full max-h-[calc(100dvh-6rem)] overflow-y-auto border-b border-rule bg-paper px-4 pb-10 pt-2 shadow-[0_24px_40px_-24px_rgb(26_29_27/0.35)]"
              >
                <ul>
                  {nav.map((item) => (
                    <li key={item.href} className="border-b border-rule">
                      {item.children.length ? (
                        <details className="group/sub">
                          <summary className="display flex cursor-pointer list-none items-center justify-between py-4 text-[1.375rem] [&::-webkit-details-marker]:hidden">
                            {item.label}
                            <span className="font-sans text-[1.25rem] text-ink-soft group-open/sub:hidden">+</span>
                            <span className="hidden font-sans text-[1.25rem] text-ink-soft group-open/sub:inline">−</span>
                          </summary>
                          <ul className="grid grid-cols-2 gap-x-4 pb-4">
                            <li className="col-span-2">
                              <Link href={item.href} className="block py-1.5 text-[0.9375rem] font-semibold">
                                All {item.label}
                              </Link>
                            </li>
                            {[...item.children, ...item.highlights].map((c) => (
                              <li key={c.href}>
                                <Link href={c.href} className="block py-1.5 text-[0.9375rem] text-ink-soft">
                                  {c.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <Link href={item.href} className="display block py-4 text-[1.375rem]">
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                  <li className="border-b border-rule">
                    <Link href="/shelf" className="display block py-4 text-[1.375rem]">
                      The Shelf
                    </Link>
                  </li>
                  <li className="border-b border-rule">
                    <Link href="/account" className="display block py-4 text-[1.375rem]">
                      Your account
                    </Link>
                  </li>
                  <li>
                    <Link href="/on-request" className="display block py-4 text-[1.375rem]">
                      Request a book
                    </Link>
                  </li>
                </ul>
              </nav>
            </details>
          </div>

          <div className="hidden md:block">
            <Wordmark priority className="h-[19px]" />
          </div>

          <div className="md:hidden">
            <Wordmark priority className="h-[14px]" />
          </div>
          {/* Right: a compact search, then the shelf, account and bag. */}
          <div className="flex items-center justify-end gap-0.5">
            <div className="mr-3 hidden w-[17rem] md:block lg:w-[19rem]">
              <SearchBox shortcut />
            </div>
            <details className="group md:hidden">
              <summary
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
                aria-label="Search"
              >
                <SearchIcon />
              </summary>
              <div className="absolute inset-x-0 top-full border-b border-rule bg-paper px-4 py-4">
                <SearchBox variant="box" />
              </div>
            </details>
            <ShelfLink />
            <Link href="/account" aria-label="Your account" className="hidden h-11 w-11 items-center justify-center sm:flex">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 20c1-3.6 3.7-5.5 7-5.5s6 1.9 7 5.5" />
              </svg>
            </Link>
            <MiniBag data={miniBag} />
          </div>
        </div>

        {/* Desktop navigation with panels */}
        <nav aria-label="Main" className="relative hidden border-t border-rule md:block">
          <ul className="mx-auto flex max-w-6xl items-center gap-8 px-4">
            {nav.map((item) => {
              const hasPanel = item.children.length > 0 || item.highlights.length > 0
              return (
                <li key={item.href} className="group/item">
                  <Link
                    href={item.href}
                    className="block border-b-2 border-transparent py-3 text-[0.875rem] font-medium tracking-wide group-focus-within/item:border-primary group-hover/item:border-primary"
                  >
                    {item.label}
                  </Link>
                  {hasPanel ? (
                    <div className="invisible absolute inset-x-0 top-full border-b border-ink bg-paper opacity-0 shadow-[0_30px_40px_-30px_rgb(26_29_27/0.35)] transition-opacity duration-150 group-focus-within/item:visible group-focus-within/item:opacity-100 group-hover/item:visible group-hover/item:opacity-100">
                      <div className="mx-auto grid max-w-6xl grid-cols-[2fr_1fr_auto] gap-12 px-4 py-9">
                        <div>
                          <p className="eyebrow">{item.label}</p>
                          <ul className="mt-3 grid grid-cols-2 gap-x-8">
                            {item.children.map((c) => (
                              <li key={c.href}>
                                <Link href={c.href} className="block py-1.5 font-display text-[1.125rem] hover:underline hover:decoration-accent hover:underline-offset-4">
                                  {c.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                          <Link href={item.href} className="mt-4 inline-block text-[0.8125rem] font-semibold">
                            See all {item.label} →
                          </Link>
                        </div>
                        {item.highlights.length ? (
                          <div>
                            <p className="eyebrow">Our picks</p>
                            <ul className="mt-3">
                              {item.highlights.map((h) => (
                                <li key={h.href}>
                                  <Link href={h.href} className="block py-1.5 text-[0.9375rem] text-ink-soft hover:text-ink">
                                    {h.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div />
                        )}
                        {item.featured ? (
                          <Link href={`/book/${item.featured.slug}`} className="flex w-[15rem] items-center gap-4 bg-paper-deep p-4">
                            <Cover title={item.featured.title} src={item.featured.coverUrl} sizes="5rem" className="h-[7.5rem] shrink-0" />
                            <span>
                              <span className="eyebrow block">We recommend</span>
                              <span className="mt-1 block font-display text-[1.0625rem] leading-snug">{item.featured.title}</span>
                              <span className="block text-[0.8125rem] text-ink-soft">{item.featured.authorLine}</span>
                            </span>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </nav>
      </header>
    </>
  )
}
