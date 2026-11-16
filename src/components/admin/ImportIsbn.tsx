'use client'

import { Button, TextInput, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

/** "Add a book by ISBN" — shown above the Books list in the admin. */
export const ImportIsbn: React.FC = () => {
  const router = useRouter()
  const [isbn, setIsbn] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
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
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-end',
        marginBottom: '1.5rem',
        maxWidth: '36rem',
      }}
    >
      <div style={{ flex: 1 }}>
        <TextInput
          path="isbn-import"
          label="Add a book by ISBN"
          placeholder="Type or scan an ISBN, e.g. 9780099448822"
          value={isbn}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsbn(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || !isbn.trim()} buttonStyle="primary" size="medium">
        {busy ? 'Looking up…' : 'Add book'}
      </Button>
    </form>
  )
}
