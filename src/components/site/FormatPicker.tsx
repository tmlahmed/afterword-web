import Link from 'next/link'
import React from 'react'

import type { Availability } from '../../lib/availability'
import { discountPercent, formatTaka } from '../../lib/pricing'

export type FormatOption = {
  id: number
  slug: string
  format: string
  /** What tells this edition apart when two share a format, e.g. "Faber, 2024". */
  detail?: string | null
  price?: number | null
  was?: number | null
  availability: Pick<Availability, 'state' | 'label'>
  current: boolean
}

const DOT: Record<Availability['state'], string> = {
  in_stock: 'bg-ink',
  pre_order: 'border border-ink',
  on_request: 'border border-ink',
  unavailable: 'bg-ink-faint',
}

/**
 * The book's formats as tiles in the buy box: each shows its price and whether it is in stock.
 * The one being viewed is outlined; the others open their own page. Shown only when there is
 * more than one edition.
 */
export const FormatPicker: React.FC<{ options: FormatOption[] }> = ({ options }) => {
  if (options.length < 2) return null
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-[0.8125rem] font-semibold">Format</legend>
      <ul className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const off = discountPercent(o.price, o.was)
          const body = (
            <>
              <span className="block font-medium leading-snug">
                {o.format}
                {o.detail ? <span className="block text-[0.75rem] font-normal text-ink-soft">{o.detail}</span> : null}
              </span>
              <span className="mt-1.5 block text-[0.875rem] tabular-nums">
                {o.price ? <span className="font-semibold">{formatTaka(o.price)}</span> : <span className="text-ink-soft">No price yet</span>}
                {off ? <span className="ml-1.5 text-[0.75rem] font-semibold text-accent">−{off}%</span> : null}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-ink-soft">
                <span className={`inline-block size-[6px] shrink-0 rounded-full ${DOT[o.availability.state]}`} />
                {o.availability.label}
              </span>
            </>
          )
          const base = 'block h-full rounded-ui border px-3.5 py-3 text-left transition-colors'
          return (
            <li key={o.id}>
              {o.current ? (
                <div aria-current="true" className={`${base} border-ink bg-card shadow-[inset_0_0_0_1px_var(--color-ink)]`}>
                  {body}
                </div>
              ) : (
                <Link href={`/book/${o.slug}`} className={`${base} border-rule hover:border-ink/50`} aria-label={`${o.format}${o.detail ? `, ${o.detail}` : ''}${o.price ? `, ${formatTaka(o.price)}` : ''}, ${o.availability.label}`}>
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
