'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

/** "Add a book by ISBN" — on a new book's page. Not a <form>: it sits inside the book form. */
export const ImportIsbn: React.FC = () => {
  const router = useRouter()
  const [isbn, setIsbn] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!isbn.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/editions/import-isbn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn }),
      })
      const body = (await res.json()) as { id?: number; message?: string }
      if (!res.ok || !body.id) {
        toast.error(body.message ?? 'Could not add that book.')
        return
      }
      toast.success(body.message ?? 'Book added.')
      router.push(`/admin/collections/editions/${body.id}`)
    } catch {
      toast.error('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="group"
      aria-label="Add a book by ISBN"
      onKeyDown={(e) => {
        // Enter (or a barcode scanner, which ends with Enter) looks the book up, not save the form.
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      }}
      style={{ marginBottom: '1.25rem', maxWidth: '36rem' }}
    >
      <label htmlFor="isbn-import" style={{ display: 'block', marginBottom: '0.5rem', fontSize: 13, fontWeight: 500 }}>
        Add a book by ISBN
      </label>
      {/* Our own input and button, both 40px tall, so they line up exactly. */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
        <input
          id="isbn-import"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Type or scan an ISBN, e.g. 9780099448822"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 40,
            padding: '0 0.75rem',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s, 3px)',
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-elevation-800)',
            fontSize: 14,
          }}
        />
        <Button type="button" onClick={() => void submit()} disabled={busy || !isbn.trim()} buttonStyle="primary" size="medium" margin={false}>
          {busy ? 'Looking up…' : 'Add book'}
        </Button>
      </div>
    </div>
  )
}
