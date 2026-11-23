'use client'

import { Button, toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useState } from 'react'

/** "Receive this delivery" on a purchase order. */
export const ReceiveStock: React.FC = () => {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields.status?.value as string | undefined)
  const [busy, setBusy] = useState(false)
  if (!id || status === 'received') return null

  const receive = async () => {
    if (!window.confirm('Add every book on this purchase order to stock, at the landed costs shown? Save any changes to quantities, prices or costs first.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/purchase-orders/${id}/receive`, { method: 'POST', credentials: 'include' })
      const data = (await res.json()) as { message?: string; marks?: string[] }
      if (!res.ok) toast.error(data.message ?? 'That did not work.')
      else {
        toast.success(data.message ?? 'Stock received.')
        // Copies to label stay on the page under "Labelling" after it reloads.
        if (data.marks?.length) toast.warning('Some copies need a lot code written in them. See Labelling.')
        window.location.reload()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Button disabled={busy} onClick={receive} buttonStyle="primary" size="medium">
        {busy ? 'Receiving…' : 'Receive this delivery into stock'}
      </Button>
    </div>
  )
}
