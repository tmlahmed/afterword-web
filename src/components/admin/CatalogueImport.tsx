'use client'

import { Button, toast, useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

import { COLUMNS, templateCsv } from '../../lib/catalogue-import/csv'

type Progress = {
  id: number
  name: string
  status: 'queued' | 'running' | 'done' | 'stopped' | 'failed'
  total: number
  processed: number
  created: number
  updated: number
  notFound: number
  failed: number
  log?: { line: number; isbn: string; outcome: string; message: string; editionId?: number }[]
}

const STATUS: Record<Progress['status'], string> = {
  queued: 'Waiting to start',
  running: 'Importing',
  done: 'Finished',
  stopped: 'Stopped',
  failed: 'Stopped by an error — open it again to carry on',
}

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  padding: '1rem 1.25rem',
  marginBottom: '1.5rem',
  maxWidth: '52rem',
}

/** Live progress for one import, polled every few seconds while it runs. */
const ProgressPanel: React.FC<{ id: number; compact?: boolean }> = ({ id, compact }) => {
  const [job, setJob] = useState<Progress | null>(null)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const res = await fetch(`/api/catalogue-imports/${id}/progress`, { credentials: 'include' })
        if (res.ok && live) {
          const body = (await res.json()) as Progress
          setJob(body)
          if (body.status === 'running' || body.status === 'queued') timer = setTimeout(load, 3000)
        }
      } catch {
        if (live) timer = setTimeout(load, 6000)
      }
    }
    void load()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [id])

  if (!job) return <p>Loading…</p>

  const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0
  const remaining = job.total - job.processed
  const stopImport = async () => {
    await fetch(`/api/catalogue-imports/${id}/stop`, { method: 'POST', credentials: 'include' })
    toast.success('Import stopped. Books already imported are kept.')
    setJob({ ...job, status: 'stopped' })
  }
  const problems = job.log ?? []

  return (
    <div>
      <p style={{ margin: 0 }}>
        <strong>{STATUS[job.status]}</strong> · {job.processed} of {job.total} rows ({pct}%)
        {job.status === 'running' && remaining > 0 ? ` · about ${Math.max(1, Math.round((remaining * 1.5) / 60))} min left` : ''}
      </p>
      <div style={{ height: 6, background: 'var(--theme-elevation-100)', margin: '0.6rem 0' }}>
        <div style={{ height: 6, width: `${pct}%`, background: 'var(--theme-success-500)', transition: 'width .4s' }} />
      </div>
      <p style={{ margin: 0, color: 'var(--theme-elevation-600)' }}>
        {job.created} added · {job.updated} updated · {job.notFound} not found · {job.failed} could not be read
      </p>
      {job.status === 'running' || job.status === 'queued' ? (
        <div style={{ marginTop: '0.75rem' }}>
          <Button buttonStyle="secondary" size="small" onClick={stopImport}>
            Stop import
          </Button>
        </div>
      ) : null}
      {!compact && problems.length ? (
        <>
          <h4 style={{ margin: '1.25rem 0 0.5rem' }}>Rows that need a look ({problems.length})</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '4px 8px 4px 0' }}>Row</th>
                <th style={{ padding: '4px 8px' }}>ISBN</th>
                <th style={{ padding: '4px 8px' }}>What happened</th>
              </tr>
            </thead>
            <tbody>
              {problems.slice(0, 500).map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--theme-elevation-100)' }}>
                  <td style={{ padding: '4px 8px 4px 0' }}>{p.line}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>
                    {p.editionId ? <a href={`/admin/collections/editions/${p.editionId}`}>{p.isbn}</a> : p.isbn}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{p.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length > 500 ? <p>And {problems.length - 500} more.</p> : null}
        </>
      ) : null}
      {compact ? (
        <p style={{ margin: '0.5rem 0 0' }}>
          <a href={`/admin/collections/catalogue-imports/${id}`}>See every row that needs a look →</a>
        </p>
      ) : null}
    </div>
  )
}

/** "Import from a spreadsheet" — shown above the Books list. */
export const CatalogueImport: React.FC = () => {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'afterword-catalogue-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const start = async () => {
    if (!file || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/catalogue-imports/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, csv: await file.text() }),
      })
      const body = (await res.json()) as { id?: number; message?: string; total?: number; skipped?: number; unknownColumns?: string[] }
      if (!res.ok || !body.id) {
        toast.error(body.message ?? 'Could not start the import.')
        return
      }
      toast.success(`Importing ${body.total} books.${body.skipped ? ` ${body.skipped} rows could not be read.` : ''}`)
      if (body.unknownColumns?.length) toast.warning(`Ignored columns: ${body.unknownColumns.join(', ')}`)
      setJobId(body.id)
      setFile(null)
      if (input.current) input.current.value = ''
    } catch {
      toast.error('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <strong>Import books from a spreadsheet</strong>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
          {open ? 'Hide the columns' : 'Which columns?'}
        </button>
      </div>
      {open ? (
        <ul style={{ margin: '0.75rem 0', paddingLeft: '1.1rem', fontSize: 13 }}>
          {COLUMNS.map((c) => (
            <li key={c.key}>
              <code>{c.key}</code> — {c.help}
            </li>
          ))}
          <li>Books already in the catalogue are updated, not duplicated. You can run the same file again safely.</li>
        </ul>
      ) : null}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <input ref={input} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button buttonStyle="primary" size="small" disabled={!file || busy} onClick={start}>
          {busy ? 'Reading the file…' : 'Start import'}
        </Button>
        <Button buttonStyle="secondary" size="small" onClick={downloadTemplate}>
          Download a template
        </Button>
      </div>
      <p style={{ margin: '0.5rem 0 0', fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        Save the sheet as CSV first. You can close this page while it runs.
      </p>
      {jobId ? (
        <div style={{ marginTop: '1rem' }}>
          <ProgressPanel id={jobId} compact />
        </div>
      ) : null}
    </div>
  )
}

/** Shown at the top of an import's own page. */
export const ImportProgressField: React.FC = () => {
  const { id } = useDocumentInfo()
  if (!id) return null
  return (
    <div style={{ ...box, maxWidth: 'none' }}>
      <ProgressPanel id={Number(id)} />
    </div>
  )
}
