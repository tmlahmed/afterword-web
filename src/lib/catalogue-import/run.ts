import type { Payload } from 'payload'

import type { CatalogueImport, Edition } from '../../payload-types'
import { importBook } from '../isbn/importBook'
import { lookupIsbn } from '../isbn/sources'
import { slugify } from '../slug'
import type { ImportRow } from './csv'

/**
 * Works through a catalogue import one row at a time, in the background.
 * Progress is saved after every row, so the admin can show it and a restart can pick up
 * where it stopped. Looking books up is the slow part (about a second each, to stay within
 * the book databases' limits), so 5,000 books take roughly an hour and a half.
 */

export type LogEntry = {
  line: number
  isbn: string
  outcome: 'not_found' | 'failed' | 'warning'
  message: string
  editionId?: number
}

type Lookups = { subjects: Map<string, number>; suppliers: Map<string, number> }

// One runner per import per server process.
const running: Set<number> = ((globalThis as { __awImports?: Set<number> }).__awImports ??= new Set())

export const isRunningHere = (id: number) => running.has(id)

const loadLookups = async (payload: Payload): Promise<Lookups> => {
  const [subjects, suppliers] = await Promise.all([
    payload.find({ collection: 'subjects', pagination: false, depth: 0, select: { name: true, slug: true } }),
    payload.find({ collection: 'suppliers', pagination: false, depth: 0, select: { name: true } }),
  ])
  const subjectMap = new Map<string, number>()
  for (const s of subjects.docs) {
    subjectMap.set(s.name.toLowerCase(), s.id)
    if (s.slug) subjectMap.set(s.slug, s.id)
  }
  return { subjects: subjectMap, suppliers: new Map(suppliers.docs.map((s) => [s.name.toLowerCase(), s.id])) }
}

const supplierId = async (payload: Payload, lookups: Lookups, name: string): Promise<number> => {
  const key = name.toLowerCase()
  const known = lookups.suppliers.get(key)
  if (known) return known
  const created = await payload.create({ collection: 'suppliers', data: { name }, depth: 0, overrideAccess: true })
  lookups.suppliers.set(key, created.id)
  return created.id
}

type RowOutcome = { result: 'created' | 'updated' | 'not_found' | 'failed'; notes: LogEntry[] }

/** Import or update one book. Never throws: problems come back as log entries. */
export const importRow = async (payload: Payload, row: ImportRow, lookups: Lookups, importId?: number): Promise<RowOutcome> => {
  const notes: LogEntry[] = []
  const warn = (message: string, editionId?: number) => notes.push({ line: row.line, isbn: row.isbn, outcome: 'warning', message, editionId })

  try {
    const subjects: number[] = []
    for (const name of row.subjects ?? []) {
      const id = lookups.subjects.get(name.toLowerCase()) ?? lookups.subjects.get(slugify(name))
      if (id) subjects.push(id)
      else warn(`No subject called "${name}"; add it under Catalogue → Subjects and re-import, or set it by hand.`)
    }

    const fields: Partial<Edition> = {}
    if (row.listPrice !== undefined) fields.listPrice = row.listPrice
    if (row.currency) fields.listCurrency = row.currency
    if (row.price !== undefined) fields.priceOverride = row.price
    if (subjects.length) fields.subjects = subjects
    if (row.sourcing) fields.sourcing = row.sourcing
    if (row.expected) fields.expectedDate = row.expected
    if (row.supplier) fields.supplier = await supplierId(payload, lookups, row.supplier)

    const existing = (
      await payload.find({ collection: 'editions', where: { isbn13: { equals: row.isbn } }, limit: 1, depth: 0, overrideAccess: true })
    ).docs[0]

    let edition: Edition
    let created = false
    if (existing) {
      edition = Object.keys(fields).length
        ? await payload.update({ collection: 'editions', id: existing.id, data: fields, depth: 0, overrideAccess: true })
        : existing
    } else {
      const looked = await lookupIsbn(row.isbn)
      if (!looked && !row.title) {
        return {
          result: 'not_found',
          notes: [
            ...notes,
            {
              line: row.line,
              isbn: row.isbn,
              outcome: 'not_found',
              message: 'Not found in the book databases. Add a title and author column for it, or add it by hand.',
            },
          ],
        }
      }
      const overrides = looked
        ? undefined
        : { title: row.title, contributors: (row.authors ?? []).map((name) => ({ name, role: 'author' as const })) }
      const result = await importBook(payload, row.isbn, { prefetched: looked, overrides, extra: fields })
      if (!result.ok) return { result: 'failed', notes: [...notes, { line: row.line, isbn: row.isbn, outcome: 'failed', message: result.message }] }
      edition = result.edition
      created = result.created
      if (!looked) warn('Not found in the book databases; created from the title and author in the file. Add a cover and description.', edition.id)
    }

    if (row.stock !== undefined) {
      const fresh = await payload.findByID({ collection: 'editions', id: edition.id, depth: 0, overrideAccess: true, select: { stockOnHand: true } })
      const delta = row.stock - (fresh.stockOnHand ?? 0)
      if (delta !== 0) {
        await payload.create({
          collection: 'stock-movements',
          data: {
            edition: edition.id,
            quantity: delta,
            reason: created || !existing?.stockOnHand ? 'opening' : 'adjustment',
            note: `Catalogue import${importId ? ` #${importId}` : ''}, line ${row.line}`,
          },
          depth: 0,
          overrideAccess: true,
        })
      }
    }

    if (row.publish && edition.status !== 'published') {
      const priced = await payload.findByID({ collection: 'editions', id: edition.id, depth: 0, overrideAccess: true, select: { price: true } })
      if (priced.price) {
        await payload.update({ collection: 'editions', id: edition.id, data: { status: 'published' }, depth: 0, overrideAccess: true })
      } else {
        warn('Left as a draft because it has no price. Give it a list price and currency, or a price.', edition.id)
      }
    }

    return { result: created ? 'created' : 'updated', notes }
  } catch (err) {
    return {
      result: 'failed',
      notes: [...notes, { line: row.line, isbn: row.isbn, outcome: 'failed', message: err instanceof Error ? err.message : String(err) }],
    }
  }
}

/** Run (or carry on with) an import until it finishes or a person stops it. */
export const runImport = async (payload: Payload, id: number, onRow?: (done: number, total: number) => void): Promise<void> => {
  if (running.has(id)) return
  running.add(id)
  try {
    let job = (await payload.findByID({ collection: 'catalogue-imports', id, depth: 0, overrideAccess: true })) as CatalogueImport
    if (job.status === 'done' || job.status === 'stopped') return
    const rows = (job.rows ?? []) as ImportRow[]
    const log = ((job.log ?? []) as LogEntry[]).slice()
    const counts = { created: job.created ?? 0, updated: job.updated ?? 0, notFound: job.notFound ?? 0, failed: job.failed ?? 0 }
    const lookups = await loadLookups(payload)

    await payload.update({
      collection: 'catalogue-imports',
      id,
      data: { status: 'running', startedAt: job.startedAt ?? new Date().toISOString(), heartbeatAt: new Date().toISOString() },
      depth: 0,
      overrideAccess: true,
    })

    for (let i = job.processed ?? 0; i < rows.length; i++) {
      // A person can stop an import from the admin; check before each book.
      job = (await payload.findByID({ collection: 'catalogue-imports', id, depth: 0, overrideAccess: true, select: { status: true } })) as CatalogueImport
      if (job.status === 'stopped') return

      const outcome = await importRow(payload, rows[i], lookups, id)
      if (outcome.result === 'not_found') counts.notFound++
      else counts[outcome.result]++
      log.push(...outcome.notes)

      await payload.update({
        collection: 'catalogue-imports',
        id,
        data: { processed: i + 1, ...counts, log, heartbeatAt: new Date().toISOString() },
        depth: 0,
        overrideAccess: true,
      })
      onRow?.(i + 1, rows.length)
    }

    await payload.update({
      collection: 'catalogue-imports',
      id,
      data: { status: 'done', finishedAt: new Date().toISOString() },
      depth: 0,
      overrideAccess: true,
    })
  } catch (err) {
    payload.logger.error(`Catalogue import ${id} stopped: ${err instanceof Error ? err.message : err}`)
    await payload
      .update({ collection: 'catalogue-imports', id, data: { status: 'failed' }, depth: 0, overrideAccess: true })
      .catch(() => undefined)
  } finally {
    running.delete(id)
  }
}

/** An import marked running whose server stopped (a restart, a deploy) is picked up again. */
export const resumeIfStalled = (payload: Payload, job: Pick<CatalogueImport, 'id' | 'status' | 'heartbeatAt'>) => {
  if (job.status !== 'running' && job.status !== 'queued') return
  if (running.has(job.id)) return
  const last = job.heartbeatAt ? new Date(job.heartbeatAt).getTime() : 0
  if (Date.now() - last < 2 * 60_000 && job.status === 'running') return
  void runImport(payload, job.id)
}
