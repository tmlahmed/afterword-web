import { describe, expect, it } from 'vitest'

import { parseCsv, readSheet, templateCsv } from '../../src/lib/catalogue-import/csv'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside fields', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ])
  })
  it('ignores a byte-order mark and blank lines', () => {
    expect(parseCsv('﻿isbn\n\n9780099448822\n')).toEqual([['isbn'], ['9780099448822']])
  })
})

describe('readSheet', () => {
  it('reads the template', () => {
    const { rows, problems } = readSheet(templateCsv())
    expect(problems).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ isbn: '9780099448822', listPrice: 10.99, currency: 'GBP', stock: 4, subjects: ['Fiction'], publish: true })
    expect(rows[1]).toMatchObject({ price: 1850, sourcing: 'pre_order', subjects: ['Fiction', 'Classics'], publish: false })
  })
  it('accepts common column names and ISBN-10s', () => {
    const { rows } = readSheet('ISBN-13,RRP,Currency,Qty\n0-09-944882-3,"£1,099.00",gbp,2\n')
    expect(rows[0]).toMatchObject({ isbn: '9780099448822', listPrice: 1099, currency: 'GBP', stock: 2 })
  })
  it('reports bad rows by line and keeps the good ones', () => {
    const { rows, problems } = readSheet('isbn,stock,currency,list_price\n9780099448822,3,,\n12345,1,,\n9780099448822,1,,\n9780241985472,two,,\n9780141439518,,XYZ,5\n9780141439518,,,5\n')
    expect(rows.map((r) => r.line)).toEqual([2])
    expect(problems.map((p) => p.line)).toEqual([3, 4, 5, 6, 7])
  })
  it('needs an isbn column', () => {
    expect(readSheet('title\nA book\n').problems[0].message).toMatch(/isbn/)
  })
})
