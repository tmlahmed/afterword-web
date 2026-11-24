'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Icon, type IconName } from './icons'

type Item = { id: number; kind: string; title: string; detail?: string | null; link?: string | null; createdAt: string }
type Feed = { seenAt: string | null; unread: number; items: Item[] }

const ICON: Record<string, IconName> = { order: 'orders', payment: 'wallet', request: 'requests', review: 'reviews', stock: 'purchases', refund: 'wallet' }
const EVERY = 30_000

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

/**
 * The bell at the top of the admin. It checks for new alerts every half minute (and when the
 * tab comes back into view), shows how many are new, and lists the latest. With desktop alerts
 * turned on, each new one also pops up on the computer, even while another tab is in front.
 */
export const NotificationBell: React.FC = () => {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [newSince, setNewSince] = useState<string | null>(null)
  const newest = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/me/feed', { credentials: 'include' })
      if (!res.ok) return
      const next = (await res.json()) as Feed
      // Anything newer than the last check pops up on the desktop, if allowed.
      const fresh = newest.current ? next.items.filter((i) => i.createdAt > newest.current!) : []
      if (fresh.length && canNotify() && Notification.permission === 'granted') {
        for (const item of fresh.slice(0, 3).reverse()) {
          const n = new Notification(item.title, { body: item.detail ?? undefined, tag: `aw-${item.id}`, icon: '/brand/afterword-apple-icon.png' })
          n.onclick = () => {
            window.focus()
            if (item.link) window.location.href = item.link
          }
        }
      }
      if (next.items[0]) newest.current = next.items[0].createdAt
      else newest.current ??= new Date().toISOString()
      setFeed(next)
    } catch {
      // Offline for a moment: try again on the next round.
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the browser's permission once, after hydration
    setPermission(canNotify() ? Notification.permission : 'unsupported')
    void load()
    const timer = window.setInterval(() => void load(), EVERY)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // "(3) Dashboard · AFTERWORD" in the tab, so new alerts show even from another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '')
    document.title = feed?.unread ? `(${feed.unread}) ${base}` : base
  })

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = async () => {
    const opening = !open
    setOpen(opening)
    if (opening && feed?.unread) {
      // Keep the new ones highlighted while the list is open, then count them as seen.
      setNewSince(feed.seenAt ?? '1970-01-01')
      const res = await fetch('/api/notifications/me/seen', { method: 'POST', credentials: 'include' }).catch(() => null)
      if (res?.ok) setFeed((f) => (f ? { ...f, unread: 0, seenAt: new Date().toISOString() } : f))
    }
    if (!opening) setNewSince(null)
  }

  const turnOn = async () => {
    if (!canNotify()) return
    setPermission(await Notification.requestPermission())
  }

  const unread = feed?.unread ?? 0
  return (
    <div className="aw-bell" ref={box}>
      <button type="button" className="aw-bell__button" aria-label={unread ? `Alerts, ${unread} new` : 'Alerts'} aria-expanded={open} onClick={() => void toggle()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread ? <span className="aw-bell__count">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="aw-bell__panel" role="dialog" aria-label="Alerts">
          <div className="aw-bell__head">
            <strong>Alerts</strong>
            {permission === 'default' ? (
              <button type="button" className="aw-bell__link" onClick={() => void turnOn()}>
                Turn on desktop alerts
              </button>
            ) : permission === 'denied' ? (
              <span className="aw-bell__muted">Desktop alerts are blocked in this browser</span>
            ) : permission === 'granted' ? (
              <span className="aw-bell__muted">Desktop alerts on</span>
            ) : null}
          </div>
          {feed?.items.length ? (
            <ul className="aw-bell__list">
              {feed.items.map((item) => {
                const fresh = newSince !== null && item.createdAt > newSince
                const body = (
                  <>
                    <span className="aw-bell__icon">
                      <Icon name={ICON[item.kind] ?? 'orders'} size={16} />
                    </span>
                    <span className="aw-bell__text">
                      <span className="aw-bell__title">{item.title}</span>
                      {item.detail ? <span className="aw-bell__detail">{item.detail}</span> : null}
                      <span className="aw-bell__time">{ago(item.createdAt)}</span>
                    </span>
                    {fresh ? <span className="aw-bell__dot" aria-label="New" /> : null}
                  </>
                )
                return (
                  <li key={item.id} className={fresh ? 'is-new' : undefined}>
                    {item.link ? (
                      <Link href={item.link} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      <div>{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="aw-bell__empty">Nothing yet. New orders, payments to check, book requests and reviews appear here.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
