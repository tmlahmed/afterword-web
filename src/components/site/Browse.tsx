import Link from 'next/link'
import React from 'react'

import { hrefWith, type RawParams, toggled } from '../../lib/browse'
import type { BookCardData } from '../../lib/catalogue'
import { type BrowseQuery, type BrowseResult, PRICE_BANDS, SORTS, type SortKey } from '../../lib/search'
import { BookGrid, Pager } from './Books'
import { ITEM_TYPE_LABEL } from '../../lib/itemTypes'

const STATE_LABEL: Record<string, string> = {
  in_stock: 'In stock',
  pre_order: 'Pre-order',
  on_request: 'On Request',
  unavailable: 'Unavailable',
}
const FORMAT_LABEL: Record<string, string> = {
  paperback: 'Paperback',
  hardback: 'Hardback',
  special: 'Special edition',
  boxset: 'Box set',
  board: 'Board book',
  // Gifts and stationery, filtered by type.
  ...ITEM_TYPE_LABEL,
}

type Option = { value: string; label: string; count?: number }

const Group: React.FC<{
  title: string
  param: string
  options: Option[]
  selected: string[]
  basePath: string
  params: RawParams
}> = ({ title, param, options, selected, basePath, params }) =>
  options.length === 0 ? null : (
    <fieldset className="border-t border-rule py-4">
      <legend className="eyebrow float-left mb-2 w-full">{title}</legend>
      <ul className="clear-both space-y-0.5">
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <li key={o.value}>
              <Link
                href={hrefWith(basePath, params, { [param]: toggled(selected, o.value) })}
                rel="nofollow"
                aria-pressed={on}
                className="flex items-center gap-2.5 py-1.5 text-[0.9375rem]"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border rounded-ui ${on ? 'border-primary bg-primary text-paper' : 'border-ink-faint'}`}
                >
                  {on ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1.5 5.2l2.3 2.3 4.7-5" />
                    </svg>
                  ) : null}
                </span>
                <span className={on ? 'font-semibold' : ''}>{o.label}</span>
                {o.count !== undefined ? <span className="ml-auto text-[0.8125rem] tabular-nums text-ink-faint">{o.count}</span> : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )

const fromFacet = (facet: Record<string, number> | undefined, labels?: Record<string, string>): Option[] =>
  Object.entries(facet ?? {})
    .map(([value, count]) => ({ value, count, label: labels?.[value] ?? value }))
    .sort((a, b) => b.count - a.count)

/**
 * A grid of books with filters, sort and paging, all driven by the address bar.
 * Filters are plain links, so they work without any script and can be shared or bookmarked.
 */
export const Browse: React.FC<{
  result: BrowseResult
  query: BrowseQuery
  basePath: string
  params: RawParams
  /** Subjects offered as a filter (omit on a page already inside one subject). */
  subjectOptions?: { slug: string; name: string }[]
  emptyMessage?: string
  /** What the results are called: books, or items for Gifts & Stationery. */
  noun?: { one: string; many: string }
}> = ({ result, query, basePath, params, subjectOptions, emptyMessage, noun = { one: 'book', many: 'books' } }) => {
  const active = [query.format, query.state, query.language, query.subject, query.price].reduce((n, a) => n + (a?.length ?? 0), 0)
  const sortKey: SortKey = query.sort ?? (query.q ? 'relevance' : 'title')
  const sorts = (Object.keys(SORTS) as SortKey[]).filter((k) => k !== 'relevance' || query.q)

  const subjectFacet = result.facets.subjects ?? {}
  const subjects: Option[] = (subjectOptions ?? [])
    .map((s) => ({ value: s.slug, label: s.name, count: subjectFacet[s.slug] }))
    .filter((o) => o.count)

  const filters = result.full ? (
    <>
      <Group title="Availability" param="state" options={fromFacet(result.facets.state, STATE_LABEL)} selected={query.state ?? []} basePath={basePath} params={params} />
      <Group title="Format" param="format" options={fromFacet(result.facets.format, FORMAT_LABEL)} selected={query.format ?? []} basePath={basePath} params={params} />
      <Group title="Price" param="price" options={PRICE_BANDS.map((b) => ({ value: b.key, label: b.label }))} selected={query.price ?? []} basePath={basePath} params={params} />
      <Group title="Subject" param="subject" options={subjects} selected={query.subject ?? []} basePath={basePath} params={params} />
      {Object.keys(result.facets.language ?? {}).length > 1 ? (
        <Group title="Language" param="language" options={fromFacet(result.facets.language)} selected={query.language ?? []} basePath={basePath} params={params} />
      ) : null}
    </>
  ) : null

  const clear = hrefWith(basePath, params, { format: undefined, state: undefined, language: undefined, subject: undefined, price: undefined })

  return (
    <div className="mx-auto max-w-6xl px-4 md:grid md:grid-cols-[13.5rem_1fr] md:gap-x-10">
      {filters ? (
        <aside aria-label="Filters">
          {/* Phones: filters fold away. Desktop: always open in the side column. */}
          <details className="group border-y border-ink md:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
              <span>Filter{active ? ` · ${active}` : ''}</span>
              <span className="text-ink-soft group-open:hidden">Show</span>
              <span className="hidden text-ink-soft group-open:inline">Hide</span>
            </summary>
            <div className="pb-2">{filters}</div>
          </details>
          <div className="hidden md:block">
            <div className="flex items-baseline justify-between border-t border-ink pb-3 pt-3">
              <p className="text-[0.9375rem] font-semibold">Filter</p>
              {active ? (
                <Link href={clear} rel="nofollow" className="link text-[0.8125rem]">
                  Clear all
                </Link>
              ) : null}
            </div>
            {filters}
          </div>
        </aside>
      ) : (
        <div className="hidden md:block" />
      )}

      <div className={filters ? '' : 'md:col-span-2'}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-3 md:border-t md:border-ink">
          <p className="text-[0.8125rem] text-ink-soft">
            {result.total} {result.total === 1 ? noun.one : noun.many}
            {active ? (
              <Link href={clear} rel="nofollow" className="link ml-3 md:hidden">
                Clear filters
              </Link>
            ) : null}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.8125rem]">
            <span className="text-ink-faint">Sort</span>
            {sorts.map((key) => (
              <Link
                key={key}
                href={hrefWith(basePath, params, { sort: key })}
                rel="nofollow"
                aria-current={key === sortKey ? 'true' : undefined}
                className={key === sortKey ? 'border-b border-ink font-semibold' : 'text-ink-soft hover:text-ink'}
              >
                {SORTS[key].label}
              </Link>
            ))}
          </p>
        </div>

        {result.books.length ? (
          <div className="mt-4 [&>div]:lg:grid-cols-4">
            <BookGrid books={result.books as unknown as BookCardData[]} />
          </div>
        ) : (
          <p className="py-16 text-center font-display text-[1.125rem] text-ink-soft">
            {emptyMessage ?? 'No books match those filters.'}{' '}
            {active ? (
              <Link href={clear} className="link">
                Clear the filters
              </Link>
            ) : null}
          </p>
        )}
        <Pager page={result.page} totalPages={result.totalPages} hrefFor={(p) => hrefWith(basePath, params, { page: String(p) })} />
      </div>
    </div>
  )
}
