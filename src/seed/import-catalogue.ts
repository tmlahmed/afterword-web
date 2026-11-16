/**
 * Import a catalogue spreadsheet from the command line — for the first full load, which is
 * thousands of books and easier to leave running on the server than in a browser tab.
 *
 *   pnpm import:catalogue path/to/books.csv
 *
 * Uses the same rules as the admin import. Safe to run again: books already in the
 * catalogue are updated, not duplicated. Stop with Ctrl-C and run again to carry on.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { readSheet } from '../lib/catalogue-import/csv'
import { runImport } from '../lib/catalogue-import/run'

const file = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.csv'))
if (!file) {
  console.error('Give the CSV file: pnpm import:catalogue path/to/books.csv')
  process.exit(1)
}

const payload = await getPayload({ config })
const text = await readFile(path.resolve(file), 'utf8')
const { rows, problems, unknownColumns } = readSheet(text)
if (unknownColumns.length) console.log(`Ignoring columns: ${unknownColumns.join(', ')}`)
for (const p of problems) console.log(`Row ${p.line}: ${p.message}`)
if (rows.length === 0) {
  console.error('No books to import.')
  process.exit(1)
}

// Carry on with an unfinished import of the same file, if there is one.
const name = path.basename(file)
const unfinished = await payload.find({
  collection: 'catalogue-imports',
  where: { and: [{ name: { equals: name } }, { status: { in: ['queued', 'running', 'failed'] } }, { total: { equals: rows.length } }] },
  sort: '-createdAt',
  limit: 1,
  depth: 0,
})
const job =
  unfinished.docs[0] ??
  (await payload.create({
    collection: 'catalogue-imports',
    data: {
      name,
      status: 'queued',
      total: rows.length,
      processed: 0,
      rows,
      log: problems.map((p) => ({ line: p.line, isbn: p.isbn ?? '', outcome: 'failed', message: p.message })),
      failed: problems.length,
    },
    depth: 0,
  }))
if (unfinished.docs[0]) console.log(`Carrying on with import #${job.id} from row ${job.processed}.`)

const started = Date.now()
await runImport(payload, job.id, (done, total) => {
  if (done % 10 === 0 || done === total) {
    const perRow = (Date.now() - started) / Math.max(1, done - (unfinished.docs[0]?.processed ?? 0))
    const left = Math.round(((total - done) * perRow) / 60000)
    console.log(`${done}/${total}${left ? ` · about ${left} min left` : ''}`)
  }
})

const final = await payload.findByID({ collection: 'catalogue-imports', id: job.id, depth: 0 })
console.log(`\n${final.status}: ${final.created} added, ${final.updated} updated, ${final.notFound} not found, ${final.failed} could not be read.`)
for (const entry of (final.log ?? []) as { line: number; isbn: string; message: string }[]) console.log(`  row ${entry.line} ${entry.isbn}: ${entry.message}`)
console.log(`Full list in the admin: /admin/collections/catalogue-imports/${job.id}`)
process.exit(0)
