'use client'

import React from 'react'

/**
 * − 2 + : changes take effect at once, with no "Update" button. Used in the bag popup and on the
 * bag page so quantities behave the same everywhere. At one copy, − becomes a bin unless
 * `minusRemoves` is false (where a separate remove button sits beside it).
 */
export const QtyStepper: React.FC<{
  title: string
  quantity: number
  max: number
  onChange: (quantity: number) => void
  minusRemoves?: boolean
  size?: 'sm' | 'md'
}> = ({ title, quantity, max, onChange, minusRemoves = true, size = 'sm' }) => {
  const box = size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
  const atOne = quantity <= 1
  return (
    <div className="inline-flex items-center border border-rule bg-card" role="group" aria-label={`Quantity of ${title}`}>
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={atOne && !minusRemoves}
        aria-label={atOne && minusRemoves ? `Remove ${title}` : `One fewer ${title}`}
        className={`flex ${box} items-center justify-center text-[1.125rem] hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-35`}
      >
        {atOne && minusRemoves ? <BinIcon /> : '−'}
      </button>
      <span className={`${size === 'md' ? 'w-10' : 'w-8'} text-center text-[0.9375rem] tabular-nums`} aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label={quantity >= max ? `No more copies of ${title} available` : `One more ${title}`}
        title={quantity >= max ? 'No more copies available' : undefined}
        className={`flex ${box} items-center justify-center text-[1.125rem] hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-35`}
      >
        +
      </button>
    </div>
  )
}

export const BinIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
