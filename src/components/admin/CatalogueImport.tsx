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
  padding: '1.25rem',
  marginBottom: '1.5rem',
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
  const [over, setOver] = useState(false)

  /** Takes a chosen or dropped file; anything but a CSV is refused with a message. */
  const pick = (f: File | null) => {
    if (f && !/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
      toast.error('That is not a CSV file. In Excel or Google Sheets, save or download the sheet as CSV.')
      return
    }
    setFile(f)
    if (!f && input.current) input.current.value = ''
  }

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
      pick(null)
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
      {/* The file on the left (click or drop), the two buttons on the right, all 40px tall like "Add book". */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const dropped = e.dataTransfer.files?.[0]
            if (dropped) pick(dropped)
          }}
          style={{
            position: 'relative',
            flex: '1 1 18rem',
            minWidth: 0,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0 0.75rem',
            border: `1px ${file ? 'solid' : 'dashed'} ${over ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-250)'}`,
            borderRadius: 'var(--style-radius-s, 3px)',
            background: over ? 'var(--theme-elevation-50)' : 'var(--theme-input-bg)',
            cursor: 'pointer',
            fontSize: 14,
            color: 'var(--theme-elevation-800)',
          }}
        >
          <input ref={input} type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, opacity: 0.7 }}>
            {file ? (
              <>
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M8 13h8M8 17h8" />
              </>
            ) : (
              <>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m17 8-5-5-5 5" />
                <path d="M12 3v12" />
              </>
            )}
          </svg>
          {file ? (
            <>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{file.name}</span>
              <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)', whiteSpace: 'nowrap' }}>{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <button
                type="button"
                aria-label="Remove the file"
                onClick={(e) => {
                  e.preventDefault()
                  pick(null)
                }}
                style={{ display: 'inline-flex', padding: 4, margin: '0 -4px 0 0', background: 'none', border: 0, color: 'var(--theme-elevation-500)', cursor: 'pointer' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--theme-elevation-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--theme-elevation-800)', fontWeight: 500 }}>Choose a CSV file</span> or drop it here
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
          <Button buttonStyle="secondary" size="medium" margin={false} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button buttonStyle="primary" size="medium" margin={false} disabled={!file || busy} onClick={start}>
            {busy ? 'Reading the file…' : 'Start import'}
          </Button>
        </div>
      </div>
      <p style={{ margin: '0.6rem 0 0', fontSize: 13, color: 'var(--theme-elevation-600)' }}>
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
    <div style={box}>
      <ProgressPanel id={Number(id)} />
    </div>
  )
}
