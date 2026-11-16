import Link from 'next/link'
import React from 'react'

/**
 * The AFTERWORD wordmark: spaced serif capitals closed by a brass full stop —
 * the last mark on the page, after the word.
 */
export const Wordmark: React.FC<{ className?: string; as?: 'link' | 'text' }> = ({ className = '', as = 'link' }) => {
  const mark = (
    <span className={`font-serif font-medium uppercase tracking-[0.22em] text-ink ${className}`}>
      Afterword<span className="text-brass">.</span>
    </span>
  )
  if (as === 'text') return mark
  return (
    <Link href="/" aria-label="AFTERWORD — home" className="inline-block leading-none">
      {mark}
    </Link>
  )
}

type IconProps = { className?: string }
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const MenuIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M3.5 7h17M3.5 12h17M3.5 17h11" />
  </svg>
)
export const CloseIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
)
export const SearchIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20.5 20.5" />
  </svg>
)
export const BagIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M5 8.5h14l-1 11.5H6L5 8.5z" />
    <path d="M9 8.5V7a3 3 0 016 0v1.5" />
  </svg>
)
export const ShelfIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M6.5 4.5h11v16l-5.5-3.6-5.5 3.6v-16z" />
  </svg>
)
export const ArrowIcon: React.FC<IconProps> = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
)
