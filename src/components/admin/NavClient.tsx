'use client'

import { useNav } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'

import { Icon, type IconName } from './icons'

export type NavItemData = { href: string; label: string; icon: IconName; badge: number }
export type NavGroupData = { label: string; items: NavItemData[] }

const PREFS = 'aw-admin-nav'
const SCROLL = 'aw-admin-nav-scroll'
type Prefs = { closed?: boolean; collapsed?: string[] }
const readPrefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Prefs
  } catch {
    return {}
  }
}
const writePrefs = (change: Partial<Prefs>) => {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ ...readPrefs(), ...change }))
  } catch {
    // Private windows: the menu just forgets.
  }
}

const isActive = (pathname: string, href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`))

const Item: React.FC<{ item: Pick<NavItemData, 'href' | 'label' | 'icon' | 'badge'>; active: boolean }> = ({ item, active }) => (
  <Link href={item.href} prefetch={false} className={`aw-nav__link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
    <span className="aw-nav__icon">
      <Icon name={item.icon} />
    </span>
    <span className="aw-nav__label">{item.label}</span>
    {item.badge ? (
      <span className="aw-nav__badge" aria-label={`${item.badge} waiting`}>
        {item.badge > 99 ? '99+' : item.badge}
      </span>
    ) : null}
  </Link>
)

/**
 * The menu's links: Dashboard and Reports first, then the groups. A group's heading folds it
 * away, remembered on this computer, and the menu keeps its scroll position from page to page.
 * On laptop-sized screens Payload starts with the menu shut; here it opens, unless it was shut
 * by hand last time.
 */
export const AdminNavLinks: React.FC<{ groups: NavGroupData[]; showReports: boolean }> = ({ groups, showReports }) => {
  const pathname = usePathname()
  const { navOpen, setNavOpen, hydrated, navRef } = useNav()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const settled = useRef(false)

  // Remembered folds, read once in the browser.
  useEffect(() => {
    const prefs = readPrefs()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preference, read after hydration
    setCollapsed(prefs.collapsed ?? [])
  }, [])

  // Open on wider screens unless shut by hand. Payload closes it on load at these sizes, so
  // this waits a moment for that to happen first.
  useEffect(() => {
    if (!hydrated || settled.current) return
    const t = window.setTimeout(() => {
      if (window.innerWidth > 1024 && !readPrefs().closed) setNavOpen(true)
      settled.current = true
    }, 60)
    return () => window.clearTimeout(t)
  }, [hydrated, setNavOpen])

  // Keep the menu where it was scrolled to: a new page draws a new menu, which would otherwise
  // start back at the top.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const saved = Number(sessionStorage.getItem(SCROLL) || 0)
    const restore = () => {
      if (saved && el.scrollTop !== saved) el.scrollTop = saved
    }
    restore()
    const frame = requestAnimationFrame(restore)
    // Opening the menu on load changes its size; put it back once it has.
    const later = window.setTimeout(restore, 400)
    const onScroll = () => sessionStorage.setItem(SCROLL, String(el.scrollTop))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(later)
      el.removeEventListener('scroll', onScroll)
    }
  }, [navRef])

  // Remember a hand-made open or shut on wider screens.
  useEffect(() => {
    if (settled.current && window.innerWidth > 1024) writePrefs({ closed: !navOpen })
  }, [navOpen])

  const toggle = (label: string) => {
    const next = collapsed.includes(label) ? collapsed.filter((l) => l !== label) : [...collapsed, label]
    setCollapsed(next)
    writePrefs({ collapsed: next })
  }

  return (
    <div className="aw-nav__links">
      <div className="aw-nav__top">
        <Item item={{ href: '/admin', label: 'Dashboard', icon: 'dashboard', badge: 0 }} active={isActive(pathname, '/admin')} />
        {showReports ? <Item item={{ href: '/admin/reports', label: 'Reports', icon: 'reports', badge: 0 }} active={isActive(pathname, '/admin/reports')} /> : null}
      </div>

      {groups.map((g) => {
        const folded = collapsed.includes(g.label)
        const waiting = g.items.reduce((n, i) => n + i.badge, 0)
        return (
          <section key={g.label} className="aw-nav__group">
            <button type="button" className="aw-nav__heading" aria-expanded={!folded} onClick={() => toggle(g.label)}>
              <span>{g.label}</span>
              {folded && waiting ? <span className="aw-nav__dot" aria-label={`${waiting} waiting`} /> : null}
              <span className={`aw-nav__chev${folded ? ' is-folded' : ''}`}>
                <Icon name="chevron" size={14} />
              </span>
            </button>
            {folded ? null : (
              <div className="aw-nav__items">
                {g.items.map((i) => (
                  <Item key={i.href} item={i} active={isActive(pathname, i.href)} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
