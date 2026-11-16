import React from 'react'

/** Heading block shared by the browse pages. */
export const PageHeading: React.FC<{ eyebrow?: string; title: string; intro?: string | null; children?: React.ReactNode }> = ({
  eyebrow,
  title,
  intro,
  children,
}) => (
  <header className="mx-auto max-w-6xl px-4 pb-8 pt-10 md:pb-10 md:pt-14">
    {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
    <h1 className="display mt-2 text-[2.25rem] md:text-[3.25rem]">{title}</h1>
    {intro ? <p className="mt-3 max-w-2xl font-display text-[1.125rem] text-ink-soft">{intro}</p> : null}
    {children}
  </header>
)
