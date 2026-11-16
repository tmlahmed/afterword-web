import type { CollectionConfig, Endpoint } from 'payload'

import { allow, nobody, userHasRole } from '../access/roles'
import { readSheet } from '../lib/catalogue-import/csv'
import { resumeIfStalled, runImport } from '../lib/catalogue-import/run'

const MAX_ROWS = 20000

const canImport = (user: unknown) => userHasRole(user, 'manager', 'catalogue')
const deny = () => Response.json({ message: 'You do not have permission to import books.' }, { status: 403 })

/** POST /api/catalogue-imports/start  { name, csv }  — reads the sheet and starts importing. */
const start: Endpoint = {
  path: '/start',
  method: 'post',
  handler: async (req) => {
    if (!canImport(req.user)) return deny()
    const body = (await req.json?.().catch(() => null)) as { name?: unknown; csv?: unknown } | null
    const csv = typeof body?.csv === 'string' ? body.csv : ''
    if (!csv.trim()) return Response.json({ message: 'Choose a CSV file.' }, { status: 400 })
    if (csv.length > 8_000_000) return Response.json({ message: 'That file is too large. Split it into files of up to 20,000 books.' }, { status: 413 })

    const { rows, problems, unknownColumns } = readSheet(csv)
    if (rows.length > MAX_ROWS) {
      return Response.json({ message: `That file has ${rows.length} books. Split it into files of up to ${MAX_ROWS}.` }, { status: 400 })
    }
    if (rows.length === 0) {
      return Response.json({ message: problems[0]?.message ?? 'No books found in the file.', problems }, { status: 400 })
    }

    const job = await req.payload.create({
      collection: 'catalogue-imports',
      data: {
        name: typeof body?.name === 'string' ? body.name.slice(0, 120) : 'Catalogue import',
        status: 'queued',
        total: rows.length,
        processed: 0,
        rows,
        log: problems.map((p) => ({ line: p.line, isbn: p.isbn ?? '', outcome: 'failed', message: p.message })),
        failed: problems.length,
        startedBy: req.user!.id,
      },
      depth: 0,
      overrideAccess: true,
    })
    void runImport(req.payload, job.id)
    return Response.json({ id: job.id, total: rows.length, skipped: problems.length, unknownColumns })
  },
}

/** GET /api/catalogue-imports/:id/progress */
const progress: Endpoint = {
  path: '/:id/progress',
  method: 'get',
  handler: async (req) => {
    if (!canImport(req.user)) return deny()
    const id = Number(req.routeParams?.id)
    const job = await req.payload.findByID({
      collection: 'catalogue-imports',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { name: true, status: true, total: true, processed: true, created: true, updated: true, notFound: true, failed: true, log: true, heartbeatAt: true },
    })
    if (!job) return Response.json({ message: 'Import not found.' }, { status: 404 })
    resumeIfStalled(req.payload, job)
    return Response.json(job)
  },
}

/** POST /api/catalogue-imports/:id/stop */
const stop: Endpoint = {
  path: '/:id/stop',
  method: 'post',
  handler: async (req) => {
    if (!canImport(req.user)) return deny()
    const id = Number(req.routeParams?.id)
    await req.payload.update({ collection: 'catalogue-imports', id, data: { status: 'stopped' }, depth: 0, overrideAccess: true })
    return Response.json({ ok: true })
  },
}

export const CatalogueImports: CollectionConfig = {
  slug: 'catalogue-imports',
  labels: { singular: 'Catalogue import', plural: 'Catalogue imports' },
  admin: {
    useAsTitle: 'name',
    group: 'Catalogue',
    defaultColumns: ['name', 'status', 'processed', 'total', 'createdAt'],
    description: 'Spreadsheet imports. Start one from Catalogue → Books.',
  },
  access: {
    read: allow('manager', 'catalogue'),
    create: nobody,
    update: nobody,
    delete: allow('manager'),
  },
  endpoints: [start, progress, stop],
  fields: [
    { name: 'progressView', type: 'ui', admin: { components: { Field: '/components/admin/CatalogueImport#ImportProgressField' } } },
    { name: 'name', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [
        { label: 'Waiting to start', value: 'queued' },
        { label: 'Importing', value: 'running' },
        { label: 'Finished', value: 'done' },
        { label: 'Stopped', value: 'stopped' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      type: 'row',
      admin: { condition: () => false },
      fields: [
        { name: 'total', type: 'number', defaultValue: 0 },
        { name: 'processed', type: 'number', defaultValue: 0 },
        { name: 'created', type: 'number', defaultValue: 0 },
        { name: 'updated', type: 'number', defaultValue: 0 },
        { name: 'notFound', type: 'number', defaultValue: 0 },
        { name: 'failed', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'rows', type: 'json', admin: { hidden: true } },
    { name: 'log', type: 'json', admin: { hidden: true } },
    { name: 'startedBy', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar', readOnly: true } },
    { name: 'startedAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'finishedAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'heartbeatAt', type: 'date', admin: { hidden: true } },
  ],
}
