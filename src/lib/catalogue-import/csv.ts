import { normaliseIsbn } from '../isbn/isbn'

/**
 * Reading a catalogue spreadsheet. Staff export a sheet as CSV (Excel, Numbers and Google Sheets
 * all do this); each row is one book, found by its ISBN. Every column except the ISBN is optional.
 */

export const COLUMNS = [
  { key: 'isbn', help: 'Required. ISBN-10 or ISBN-13, with or without hyphens.' },
  { key: 'list_price', help: 'The publisher’s printed price, e.g. 9.99.' },
  { key: 'currency', help: 'GBP, USD, INR, EUR or BDT. Needed with list_price.' },
  { key: 'price', help: 'A manual selling price in taka. Leave empty to calculate from the list price.' },
  { key: 'stock', help: 'Copies in Dhaka right now. Leave empty to leave stock alone.' },
  { key: 'subjects', help: 'Subject names, separated by semicolons, e.g. Fiction; Crime.' },
  { key: 'sourcing', help: 'standard, pre_order or out_of_print.' },
  { key: 'expected', help: 'For pre-orders: the date it reaches Dhaka, as 2026-12-31.' },
  { key: 'supplier', help: 'Supplier name. A new supplier is created if the name is not known.' },
  { key: 'publish', help: 'yes to put the book in the shop straight away. Otherwise it is saved as a draft.' },
  { key: 'title', help: 'Used only when the ISBN cannot be found in the book databases.' },
  { key: 'author', help: 'Used only when the ISBN cannot be found. Separate several with semicolons.' },
] as const

export type ColumnKey = (typeof COLUMNS)[number]['key']

export type ImportRow = {
  line: number
  isbn: string
  listPrice?: number
  currency?: 'GBP' | 'USD' | 'INR' | 'EUR' | 'BDT'
  price?: number
  stock?: number
  subjects?: string[]
  sourcing?: 'standard' | 'pre_order' | 'out_of_print'
  expected?: string
  supplier?: string
  publish?: boolean
  title?: string
  authors?: string[]
}

export type RowProblem = { line: number; isbn?: string; message: string }

/** RFC 4180 CSV: commas, quoted fields, doubled quotes, line breaks inside quotes. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const HEADER_ALIASES: Record<string, ColumnKey> = {
  isbn: 'isbn',
  isbn13: 'isbn',
  isbn_13: 'isbn',
  ean: 'isbn',
  list_price: 'list_price',
  listprice: 'list_price',
  rrp: 'list_price',
  currency: 'currency',
  price: 'price',
  price_bdt: 'price',
  selling_price: 'price',
  stock: 'stock',
  qty: 'stock',
  quantity: 'stock',
  copies: 'stock',
  subjects: 'subjects',
  subject: 'subjects',
  sourcing: 'sourcing',
  expected: 'expected',
  expected_date: 'expected',
  supplier: 'supplier',
  publish: 'publish',
  title: 'title',
  author: 'author',
  authors: 'author',
}

const headerKey = (raw: string): ColumnKey | undefined =>
  HEADER_ALIASES[raw.trim().toLowerCase().replace(/[\s-]+/g, '_')]

const number = (raw: string): number | undefined | null => {
  const cleaned = raw.replace(/[৳£$€₹,\s]/g, '')
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const list = (raw: string) =>
  raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Turn the sheet into rows to import, and a list of the rows that cannot be read. */
export const readSheet = (text: string): { rows: ImportRow[]; problems: RowProblem[]; unknownColumns: string[] } => {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], problems: [{ line: 1, message: 'The file is empty.' }], unknownColumns: [] }

  const header = table[0].map(headerKey)
  const unknownColumns = table[0].filter((_, i) => !header[i]).map((h) => h.trim()).filter(Boolean)
  if (!header.includes('isbn')) {
    return { rows: [], problems: [{ line: 1, message: 'The first row must name the columns, and one must be called "isbn".' }], unknownColumns }
  }

  const rows: ImportRow[] = []
  const problems: RowProblem[] = []
  const seen = new Set<string>()

  table.slice(1).forEach((cells, index) => {
    const line = index + 2
    const get = (key: ColumnKey) => {
      const at = header.indexOf(key)
      return at === -1 ? '' : (cells[at] ?? '').trim()
    }
    const rawIsbn = get('isbn')
    const isbn = normaliseIsbn(rawIsbn)
    if (!isbn) return problems.push({ line, isbn: rawIsbn, message: rawIsbn ? `"${rawIsbn}" is not a valid ISBN.` : 'No ISBN.' })
    if (seen.has(isbn)) return problems.push({ line, isbn, message: 'This ISBN appears earlier in the file; this row was skipped.' })
    seen.add(isbn)

    const row: ImportRow = { line, isbn }
    const fail = (message: string) => problems.push({ line, isbn, message })

    const listPrice = number(get('list_price'))
    if (listPrice === null) return fail(`List price "${get('list_price')}" is not a number.`)
    row.listPrice = listPrice

    const currency = get('currency').toUpperCase()
    if (currency) {
      if (!['GBP', 'USD', 'INR', 'EUR', 'BDT'].includes(currency)) return fail(`Currency "${currency}" is not one we use.`)
      row.currency = currency as ImportRow['currency']
    }
    if (row.listPrice !== undefined && !row.currency) return fail('A list price needs a currency.')

    const price = number(get('price'))
    if (price === null) return fail(`Price "${get('price')}" is not a number.`)
    row.price = price

    const stock = number(get('stock'))
    if (stock === null || (stock !== undefined && !Number.isInteger(stock))) return fail(`Stock "${get('stock')}" is not a whole number.`)
    row.stock = stock

    const subjects = list(get('subjects'))
    if (subjects.length) row.subjects = subjects

    const sourcing = get('sourcing').toLowerCase().replace(/[\s-]+/g, '_')
    if (sourcing) {
      if (!['standard', 'pre_order', 'out_of_print'].includes(sourcing)) return fail(`Sourcing "${get('sourcing')}" should be standard, pre_order or out_of_print.`)
      row.sourcing = sourcing as ImportRow['sourcing']
    }

    const expected = get('expected')
    if (expected) {
      const date = new Date(expected)
      if (Number.isNaN(date.getTime())) return fail(`Expected date "${expected}" is not a date. Write it as 2026-12-31.`)
      row.expected = date.toISOString()
    }

    row.supplier = get('supplier') || undefined
    const publish = get('publish').toLowerCase()
    row.publish = ['yes', 'y', 'true', '1'].includes(publish)
    row.title = get('title') || undefined
    const authors = list(get('author'))
    if (authors.length) row.authors = authors

    rows.push(row)
  })

  return { rows, problems, unknownColumns }
}

export const templateCsv = () =>
  [
    COLUMNS.map((c) => c.key).join(','),
    '9780099448822,10.99,GBP,,4,Fiction,standard,,Gardners,yes,,',
    '9780241985472,,,1850,0,Fiction; Classics,pre_order,2026-12-15,,no,,',
  ].join('\n') + '\n'
