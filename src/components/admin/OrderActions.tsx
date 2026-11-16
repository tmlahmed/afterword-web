'use client'

import { Button, toast, useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

type OrderState = {
  number?: string
  status: string
  paymentStatus: string
  total?: number
  paid?: number
  payNow?: number
  payOnDelivery?: number
  payNowVia?: string | null
  paymentReference?: string | null
  token?: string
  lines?: { allocated?: boolean }[]
}

const STAGE: Record<string, string> = {
  placed: 'Placed — to confirm',
  awaiting_stock: 'Awaiting stock',
  packing: 'To pack',
  shipped: 'With courier',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  padding: '1rem 1.25rem',
  marginBottom: '1.5rem',
  borderRadius: 4,
}
const input: React.CSSProperties = {
  height: 40,
  padding: '0 0.75rem',
  border: '1px solid var(--theme-elevation-250)',
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-text)',
  borderRadius: 4,
  minWidth: 0,
}

/** The order desk: shows where an order stands and offers only the steps that make sense next. */
export const OrderActions: React.FC = () => {
  const { id } = useDocumentInfo()
  const [order, setOrder] = useState<OrderState | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bKash')
  const [reference, setReference] = useState('')
  const [courier, setCourier] = useState('Pathao')
  const [trackingId, setTrackingId] = useState('')

  useEffect(() => {
    if (!id) return
    let live = true
    fetch(`/api/orders/${id}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<OrderState>) : null))
      .then((data) => live && data && setOrder(data))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id])

  const run = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${id}/action`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) toast.error(data.message ?? 'That did not work.')
      else {
        toast.success('Done.')
        // Reload so every field on the page shows the order as it now stands.
        window.location.reload()
      }
    } catch {
      toast.error('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (!id) {
    return (
      <div style={box}>
        <strong>New order.</strong> Fill in the customer, the delivery address and the books, then save. Prices, delivery and
        totals are worked out for you, and copies in stock are set aside.
      </div>
    )
  }
  if (!order) return <div style={box}>Loading the order…</div>

  const owing = (order.total ?? 0) - (order.paid ?? 0)
  const advanceOwing = Math.max(0, (order.payNow ?? 0) - (order.paid ?? 0))
  const open = !['delivered', 'returned', 'cancelled'].includes(order.status)
  const waiting = (order.lines ?? []).filter((l) => !l.allocated).length

  return (
    <div style={box}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 2rem', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '1.125rem' }}>
          {order.number} · {STAGE[order.status] ?? order.status}
        </strong>
        <span>
          Total ৳{order.total} · paid ৳{order.paid ?? 0}
          {order.payOnDelivery ? ` · courier collects ৳${order.payOnDelivery}` : ''}
        </span>
        {order.token ? (
          <a href={`/order/${order.token}`} target="_blank" rel="noreferrer">
            Customer’s tracking page ↗
          </a>
        ) : null}
        <a href={`/desk/slip/${id}`} target="_blank" rel="noreferrer">
          Print packing slip ↗
        </a>
      </div>

      {order.status === 'placed' && advanceOwing > 0 ? (
        <p style={{ margin: '0 0 0.75rem' }}>
          Waiting for an advance of <strong>৳{advanceOwing}</strong>
          {order.payNowVia === 'bkash_manual' && order.paymentReference
            ? `. The customer gave bKash transaction ID ${order.paymentReference} — check it in the bKash app, then record the payment below.`
            : '.'}
        </p>
      ) : null}
      {order.status === 'awaiting_stock' ? (
        <p style={{ margin: '0 0 0.75rem' }}>
          {waiting} {waiting === 1 ? 'book is' : 'books are'} on order from the supplier. This order moves to “To pack” by itself when
          the stock is received.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        {order.status === 'placed' && advanceOwing === 0 ? (
          <Button disabled={busy} onClick={() => run({ action: 'confirm' })} buttonStyle="primary" size="medium">
            Confirm order
          </Button>
        ) : null}

        {order.status === 'packing' ? (
          <>
            <select style={input} value={courier} onChange={(e) => setCourier(e.target.value)} aria-label="Courier">
              <option>Pathao</option>
              <option>Steadfast</option>
              <option>RedX</option>
              <option>Own delivery</option>
            </select>
            <input style={input} placeholder="Tracking number" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
            <Button disabled={busy || !trackingId.trim()} onClick={() => run({ action: 'ship', courier, trackingId })} buttonStyle="primary" size="medium">
              Hand to courier
            </Button>
          </>
        ) : null}

        {order.status === 'shipped' ? (
          <>
            <Button
              disabled={busy}
              onClick={() => run({ action: 'deliver' }, order.payOnDelivery ? `Mark delivered and record ৳${order.payOnDelivery} collected by the courier?` : 'Mark delivered?')}
              buttonStyle="primary"
              size="medium"
            >
              Mark delivered
            </Button>
            <Button disabled={busy} onClick={() => run({ action: 'return' }, 'Mark as returned undelivered? The books go back into stock.')} buttonStyle="secondary" size="medium">
              Came back undelivered
            </Button>
          </>
        ) : null}

        {open && order.status !== 'shipped' ? (
          <Button
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Cancel this order? Give a short reason (optional).')
              if (reason !== null) void run({ action: 'cancel', reason })
            }}
            buttonStyle="secondary"
            size="medium"
          >
            Cancel order
          </Button>
        ) : null}
      </div>

      {open && owing > 0 && order.status !== 'shipped' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <span>Record a payment:</span>
          <input style={{ ...input, width: 110 }} inputMode="numeric" placeholder={`৳ ${advanceOwing || owing}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select style={input} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
            <option>bKash</option>
            <option>Nagad</option>
            <option>Bank transfer</option>
            <option>Cash</option>
          </select>
          <input style={input} placeholder="Transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Button
            disabled={busy || !Number(amount)}
            onClick={() => run({ action: 'record_payment', amount: Number(amount), method, reference })}
            buttonStyle="secondary"
            size="medium"
          >
            Record payment
          </Button>
        </div>
      ) : null}
    </div>
  )
}
