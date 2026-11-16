import { describe, expect, it } from 'vitest'

import { hrefWith, parseBrowseParams, toggled } from '../../src/lib/browse'
import { toDocument } from '../../src/lib/search'
import type { Edition, Subject } from '../../src/payload-types'

describe('browse parameters', () => {
  it('reads filters, sort and page from the address', () => {
    const q = parseBrowseParams({ q: ' ishiguro ', format: 'paperback,hardback', state: 'in_stock', sort: 'price-asc', page: '3' })
    expect(q).toMatchObject({ q: 'ishiguro', format: ['paperback', 'hardback'], state: ['in_stock'], sort: 'price-asc', page: 3 })
  })
  it('drops unknown sorts, price bands and bad page numbers', () => {
    const q = parseBrowseParams({ sort: 'hacked', price: '0-1000,nonsense', page: '-4' })
    expect(q.sort).toBeUndefined()
    expect(q.price).toEqual(['0-1000'])
    expect(q.page).toBe(1)
  })
  it('toggles a filter value on and off', () => {
    expect(toggled([], 'paperback')).toBe('paperback')
    expect(toggled(['paperback'], 'hardback')).toBe('paperback,hardback')
    expect(toggled(['paperback'], 'paperback')).toBeUndefined()
  })
  it('returns to page 1 when a filter changes, but keeps the page when paging', () => {
    const params = { q: 'roy', page: '4', format: 'paperback' }
    expect(hrefWith('/search', params, { format: undefined })).toBe('/search?q=roy')
    expect(hrefWith('/search', params, { page: '5' })).toBe('/search?q=roy&page=5&format=paperback')
  })
})

describe('search document', () => {
  const parent = { id: 1, name: 'Fiction', slug: 'fiction' } as Subject
  const child = { id: 2, name: 'Poetry', slug: 'poetry', parent: 1 } as Subject
  const book = {
    id: 7,
    title: 'Gitanjali',
    slug: 'gitanjali-9780000000002',
    isbn13: '9780000000002',
    format: 'paperback',
    sourcing: 'standard',
    stockOnHand: 0,
    status: 'published',
    subjects: [child],
    contributors: [{ contributor: { id: 3, name: 'Rabindranath Tagore', slug: 'rabindranath-tagore' }, role: 'author' }],
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  } as unknown as Edition

  it('files a book under its subject and the parent subject', () => {
    const doc = toDocument(book, new Map([[1, parent], [2, child]]), ['big-ideas'])
    expect(doc.subjects).toEqual(['poetry', 'fiction'])
    expect(doc.lists).toEqual(['big-ideas'])
    expect(doc.contributors).toEqual(['Rabindranath Tagore'])
  })
  it('records the availability state worked out from stock', () => {
    expect(toDocument(book, new Map()).state).toBe('on_request')
    expect(toDocument({ ...book, stockOnHand: 2 }, new Map()).state).toBe('in_stock')
  })
})
