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
  paymentSender?: string | null
  token?: string
  subtotal?: number
  discount?: number
  refundDue?: number | null
  refunded?: number | null
  risk?: 'none' | 'check' | 'high' | null
  riskNote?: string | null
  customer?: number | { id: number } | null
  lines?: { allocated?: boolean; parcel?: number | null; title?: string | null; quantity?: number; unitPrice?: number | null; returned?: number | null }[]
  parcels?:
    | {
        status: string
        collect?: number | null
        courier?: string | null
        trackingId?: string | null
        courierStatus?: string | null
        courierFee?: number | null
        courierCheckedAt?: string | null
      }[]
    | null
}

const PARCEL_STAGE: Record<string, string> = {
  pending: 'Waiting for books',
  packing: 'To pack',
  shipped: 'With courier',
  delivered: 'Delivered',
  returned: 'Came back',
  cancelled: 'Cancelled',
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
  const [pathao, setPathao] = useState<'off' | 'test' | 'live'>('off')
  const [history, setHistory] = useState<{ orders: number; delivered: number; cancelled: number; refused: number } | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState('bKash')
  const [refundRef, setRefundRef] = useState('')
  const [takeOpen, setTakeOpen] = useState(false)
  const [takeQty, setTakeQty] = useState<Record<number, number>>({})
  const [condition, setCondition] = useState<'resell' | 'damaged'>('resell')
  const [outcome, setOutcome] = useState<'refund' | 'replace'>('refund')
  const [takeRefund, setTakeRefund] = useState('')
  const [takeReason, setTakeReason] = useState('')

  useEffect(() => {
    if (!id) return
    let live = true
    fetch(`/api/orders/${id}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<OrderState>) : null))
      .then((data) => {
        if (!live || !data) return
        setOrder(data)
        // The customer's record, for deciding whether to call before confirming.
        const customerId = typeof data.customer === 'object' && data.customer ? data.customer.id : data.customer
        if (customerId) {
          Promise.all([
            fetch(`/api/customers/${customerId}?depth=0`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
            fetch(`/api/orders?where[customer][equals]=${customerId}&where[id][not_equals]=${id}&limit=200&depth=0&select[status]=true`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
          ])
            .then(([customer, past]: [{ refusedCount?: number } | null, { docs?: { status: string }[] } | null]) => {
              const docs = past?.docs ?? []
              if (live) {
                setHistory({
                  orders: docs.length,
                  delivered: docs.filter((o) => o.status === 'delivered').length,
                  cancelled: docs.filter((o) => o.status === 'cancelled').length,
                  refused: customer?.refusedCount ?? 0,
                })
              }
            })
            .catch(() => undefined)
        }
      })
      .catch(() => undefined)
    fetch('/api/orders/courier-mode', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ pathao: 'off' | 'test' | 'live' }>) : null))
      .then((data) => live && data && setPathao(data.pathao))
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
        toast.success(data.message ?? 'Done.')
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
  const refundDue = order.refundDue ?? 0
  // Delivered books that can still come back, and what the chosen copies were paid for.
  // Orders from before parcels existed have none recorded: the order's own status stands for its one parcel.
  const deliveredParcel = (i: number) => (order.parcels?.length ? order.parcels[i]?.status : order.status) === 'delivered'
  const returnable = (order.lines ?? [])
    .map((line, index) => ({ line, index, left: (line.quantity ?? 0) - (line.returned ?? 0) }))
    .filter(({ line, left }) => left > 0 && deliveredParcel(line.parcel ?? 0))
  const keep = order.subtotal ? 1 - (order.discount ?? 0) / order.subtotal : 1
  const takeCount = Object.values(takeQty).reduce((a, b) => a + b, 0)
  const takeWorth = Math.round(Object.entries(takeQty).reduce((sum, [i, q]) => sum + ((order.lines ?? [])[Number(i)]?.unitPrice ?? 0) * q * keep, 0))
  const advanceOwing = Math.max(0, (order.payNow ?? 0) - (order.paid ?? 0))
  const open = !['delivered', 'returned', 'cancelled'].includes(order.status)
  // Orders from before parcels existed are shown as one parcel.
  const parcels =
    order.parcels && order.parcels.length
      ? order.parcels
      : [{ status: order.status === 'placed' || order.status === 'awaiting_stock' ? 'pending' : order.status, collect: order.payOnDelivery ?? 0 }]
  const two = parcels.length > 1
  const anyShipped = parcels.some((p) => p.status === 'shipped')
  const cancellable = order.status === 'placed' || (!anyShipped && parcels.some((p) => p.status === 'pending' || p.status === 'packing'))
  const parcelName = (i: number) => (two ? (i === 0 ? 'Parcel 1 · books in stock' : 'Parcel 2 · books ordered in') : 'Parcel')
  const booksIn = (i: number) => (order.lines ?? []).filter((l) => (l.parcel ?? 0) === i)
  const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }

  return (
    <div style={box}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 2rem', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '1.125rem' }}>
          {order.number} · {STAGE[order.status] ?? order.status}
        </strong>
        <span>
          Total ৳{order.total} · paid ৳{order.paid ?? 0}
          {order.payOnDelivery ? ` · couriers still to collect ৳${order.payOnDelivery}` : ''}
        </span>
        {order.token ? (
          <a href={`/order/${order.token}`} target="_blank" rel="noreferrer">
            Customer’s tracking page ↗
          </a>
        ) : null}
      </div>

      {order.risk && order.risk !== 'none' ? (
        <div
          role="note"
          style={{
            margin: '0 0 0.75rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 4,
            border: `1px solid ${order.risk === 'high' ? '#d22b2f' : '#d99a00'}`,
            background: order.risk === 'high' ? 'rgb(210 43 47 / 0.08)' : 'rgb(217 154 0 / 0.1)',
          }}
        >
          <strong>{order.risk === 'high' ? 'High risk' : 'Check first'}:</strong> {order.riskNote}.{' '}
          {order.risk === 'high' ? 'Consider asking for an advance before sending.' : 'Call the customer before confirming.'}
        </div>
      ) : null}
      {history ? (
        <p style={{ margin: '0 0 0.75rem', fontSize: 13, opacity: 0.8 }}>
          {history.orders
            ? `Customer’s earlier orders: ${history.orders} · ${history.delivered} delivered${history.cancelled ? ` · ${history.cancelled} cancelled` : ''}${history.refused ? ` · ${history.refused} ${history.refused === 1 ? 'parcel' : 'parcels'} refused` : ''}`
            : 'First order from this customer.'}
        </p>
      ) : null}

      {order.status === 'placed' && advanceOwing > 0 ? (
        <p style={{ margin: '0 0 0.75rem' }}>
          Waiting for an advance of <strong>৳{advanceOwing}</strong>
          {order.payNowVia === 'bkash_manual' && (order.paymentSender || order.paymentReference) ? (
            <>
              . The customer says they paid from <strong>{order.paymentSender ?? 'number not given'}</strong>
              {order.paymentReference ? (
                <>
                  , transaction ID <strong>{order.paymentReference}</strong>
                </>
              ) : (
                ' (no transaction ID given)'
              )}
              . Find it in the bKash app by that number and the amount, then record the payment below.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : null}

      {order.status === 'placed' && advanceOwing === 0 ? (
        <div style={{ ...row, marginBottom: '0.75rem' }}>
          <Button disabled={busy} onClick={() => run({ action: 'confirm' })} buttonStyle="primary" size="medium">
            Confirm order
          </Button>
        </div>
      ) : null}

      {/* Each parcel: its books, what the courier collects, and the next step for it. */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {parcels.map((p, i) => (
          <div key={i} style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem 1.5rem' }}>
              <strong>
                {parcelName(i)} · {order.status === 'placed' ? 'Waiting for confirmation' : (PARCEL_STAGE[p.status] ?? p.status)}
              </strong>
              <span>
                Courier collects <strong>৳{p.collect ?? 0}</strong>
                {' · '}
                <a href={`/desk/slip/${id}${two ? `?parcel=${i}` : ''}`} target="_blank" rel="noreferrer">
                  Packing slip ↗
                </a>
              </span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, margin: '0.25rem 0 0.5rem' }}>
              {booksIn(i)
                .map((l) => `${l.title}${(l.quantity ?? 1) > 1 ? ` ×${l.quantity}` : ''}${l.allocated ? '' : ' (not here yet)'}`)
                .join(' · ')}
              {p.courier ? ` — ${p.courier} ${p.trackingId ?? ''}` : ''}
            </div>

            {order.status !== 'placed' && p.status === 'packing' && pathao !== 'off' ? (
              <div style={{ ...row, marginBottom: '0.5rem' }}>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      { action: 'book_pathao', parcel: i },
                      `Book a Pathao pickup for this parcel? Pathao will collect ৳${p.collect ?? 0} from the customer.${pathao === 'test' ? ' (Pathao test server: no rider will come.)' : ''}`,
                    )
                  }
                  buttonStyle="primary"
                  size="medium"
                >
                  Book Pathao pickup
                </Button>
                <span style={{ fontSize: 13, opacity: 0.8 }}>
                  {pathao === 'test' ? 'Pathao test server. ' : ''}Or another courier, by hand:
                </span>
              </div>
            ) : null}

            {order.status !== 'placed' && p.status === 'packing' ? (
              <div style={row}>
                <select style={input} value={courier} onChange={(e) => setCourier(e.target.value)} aria-label="Courier">
                  <option>Pathao</option>
                  <option>Steadfast</option>
                  <option>RedX</option>
                  <option>Own delivery</option>
                </select>
                <input style={input} placeholder="Tracking number" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
                <Button
                  disabled={busy || !trackingId.trim()}
                  onClick={() => run({ action: 'ship', parcel: i, courier, trackingId })}
                  buttonStyle={pathao !== 'off' ? 'secondary' : 'primary'}
                  size="medium"
                >
                  Hand to courier
                </Button>
              </div>
            ) : null}

            {p.status === 'shipped' && p.courierStatus ? (
              <div style={{ fontSize: 13, margin: '0 0 0.5rem' }}>
                {p.courier} says: <strong>{p.courierStatus}</strong>
                {p.courierCheckedAt ? ` · checked ${new Date(p.courierCheckedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                {typeof p.courierFee === 'number' ? ` · their charge ৳${p.courierFee}` : ''}
              </div>
            ) : null}

            {p.status === 'shipped' ? (
              <div style={row}>
                {p.courier === 'Pathao' && pathao !== 'off' ? (
                  <Button disabled={busy} onClick={() => run({ action: 'check_courier', parcel: i })} buttonStyle="secondary" size="medium">
                    Check with Pathao
                  </Button>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() => run({ action: 'deliver', parcel: i }, p.collect ? `Mark delivered and record ৳${p.collect} collected by the courier?` : 'Mark delivered?')}
                  buttonStyle="primary"
                  size="medium"
                >
                  Mark delivered
                </Button>
                <Button disabled={busy} onClick={() => run({ action: 'return', parcel: i }, 'Mark as returned undelivered? The books go back into stock.')} buttonStyle="secondary" size="medium">
                  Came back undelivered
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt('The courier did not take this parcel? It goes back to “To pack”. Give a short reason (optional).')
                    if (reason !== null) void run({ action: 'unship', parcel: i, reason })
                  }}
                  buttonStyle="secondary"
                  size="medium"
                >
                  Courier did not take it
                </Button>
              </div>
            ) : null}

            {p.status === 'pending' && order.status !== 'placed' ? (
              <div style={{ fontSize: 13 }}>Moves to “To pack” by itself when the books are received.</div>
            ) : null}
          </div>
        ))}
      </div>

      {cancellable ? (
        <div style={{ ...row, marginTop: '0.75rem' }}>
          <Button
            disabled={busy}
            onClick={() => {
              const reason = window.prompt(
                parcels.some((p) => p.status === 'delivered') ? 'Cancel the books not yet sent? Give a short reason (optional).' : 'Cancel this order? Give a short reason (optional).',
              )
              if (reason !== null) void run({ action: 'cancel', reason })
            }}
            buttonStyle="secondary"
            size="medium"
          >
            {parcels.some((p) => p.status === 'delivered') ? 'Cancel the rest' : 'Cancel order'}
          </Button>
        </div>
      ) : null}

      {open && owing > 0 ? (
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

      {(order.paid ?? 0) - (order.refunded ?? 0) > 0 && (refundDue > 0 || ['cancelled', 'returned'].includes(order.status)) ? (
        <div style={{ ...row, marginTop: '0.75rem' }}>
          <span>
            {refundDue > 0 ? (
              <>
                <strong style={{ color: '#d22b2f' }}>৳{refundDue} to pay back.</strong> Record the refund once it is sent:
              </>
            ) : (
              'Record a refund:'
            )}
          </span>
          <input style={{ ...input, width: 110 }} inputMode="numeric" placeholder={`৳ ${refundDue || (order.paid ?? 0) - (order.refunded ?? 0)}`} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          <select style={input} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} aria-label="Refund method">
            <option>bKash</option>
            <option>Nagad</option>
            <option>Bank transfer</option>
            <option>Card refund</option>
            <option>Cash</option>
          </select>
          <input style={input} placeholder="Transaction ID" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />
          <Button
            disabled={busy || !Number(refundAmount)}
            onClick={() => run({ action: 'record_refund', amount: Number(refundAmount), method: refundMethod, reference: refundRef }, `Record ৳${Number(refundAmount)} paid back to the customer?`)}
            buttonStyle="secondary"
            size="medium"
          >
            Record refund
          </Button>
        </div>
      ) : null}

      {returnable.length ? (
        <div style={{ marginTop: '0.75rem' }}>
          {takeOpen ? (
            <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: '0.85rem 1rem', background: 'var(--theme-bg)' }}>
              <strong>Books that came back after delivery</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5rem 0', fontSize: 14 }}>
                <tbody>
                  {returnable.map(({ line, index, left }) => (
                    <tr key={index}>
                      <td style={{ padding: '4px 8px 4px 0' }}>{line.title}</td>
                      <td style={{ padding: '4px 0', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          max={left}
                          value={takeQty[index] ?? 0}
                          onChange={(e) => setTakeQty({ ...takeQty, [index]: Math.max(0, Math.min(left, Math.round(Number(e.target.value) || 0))) })}
                          style={{ ...input, width: 70 }}
                          aria-label={`Copies of ${line.title} back`}
                        />{' '}
                        of {left}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...row, marginBottom: '0.5rem' }}>
                <span>The copies are</span>
                <label>
                  <input type="radio" checked={condition === 'resell'} onChange={() => setCondition('resell')} /> fine, back on the shelf
                </label>
                <label>
                  <input type="radio" checked={condition === 'damaged'} onChange={() => setCondition('damaged')} /> damaged, not for sale
                </label>
              </div>
              <div style={{ ...row, marginBottom: '0.5rem' }}>
                <span>The customer gets</span>
                <label>
                  <input type="radio" checked={outcome === 'refund'} onChange={() => setOutcome('refund')} /> a refund of
                </label>
                <input
                  style={{ ...input, width: 110 }}
                  inputMode="numeric"
                  disabled={outcome !== 'refund'}
                  placeholder={`৳ ${takeWorth}`}
                  value={takeRefund}
                  onChange={(e) => setTakeRefund(e.target.value)}
                  aria-label="Refund amount"
                />
                <label>
                  <input type="radio" checked={outcome === 'replace'} onChange={() => setOutcome('replace')} /> a replacement copy
                </label>
              </div>
              <div style={row}>
                <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="Why, e.g. torn cover, wrong edition" value={takeReason} onChange={(e) => setTakeReason(e.target.value)} />
                <Button
                  disabled={busy || !takeCount}
                  onClick={() =>
                    run(
                      {
                        action: 'take_back',
                        items: Object.entries(takeQty)
                          .filter(([, q]) => q > 0)
                          .map(([line, quantity]) => ({ line: Number(line), quantity })),
                        condition,
                        outcome,
                        refund: outcome === 'refund' ? (takeRefund === '' ? takeWorth : Number(takeRefund)) : 0,
                        reason: takeReason,
                      },
                      outcome === 'refund'
                        ? `Take back ${takeCount} ${takeCount === 1 ? 'copy' : 'copies'} and owe the customer ৳${takeRefund === '' ? takeWorth : Number(takeRefund)}?`
                        : `Take back ${takeCount} ${takeCount === 1 ? 'copy' : 'copies'} and send a replacement? It comes off the shelf now.`,
                    )
                  }
                  buttonStyle="primary"
                  size="medium"
                >
                  Take back
                </Button>
                <Button disabled={busy} onClick={() => setTakeOpen(false)} buttonStyle="secondary" size="medium">
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => setTakeOpen(true)} buttonStyle="secondary" size="medium">
              Books came back after delivery…
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
