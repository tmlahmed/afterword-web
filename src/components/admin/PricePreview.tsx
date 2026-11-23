'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import type { Pricing, StockLot } from '../../payload-types'
import { discountPercent, effectiveDiscount, formatTaka } from '../../lib/pricing'
import { pricesFor } from '../../lib/repricing'

const SYMBOL: Record<string, string> = { INR: '₹', GBP: '£', USD: '$', EUR: '€', BDT: '৳' }

/**
 * What customers see, updated as staff type, and what it leaves you: the price, where the
 * discount comes from, what the next copies cost you (their lot's landed cost) and the margin,
 * with a warning when it drops below the minimum in Pricing rules. Lists the lots on the shelf.
 */
export const PricePreview: React.FC = () => {
  const { id } = useDocumentInfo()
  const useField = <T,>(name: string) => useFormFields(([fields]) => fields[name]?.value as T | undefined)
  const kind = useField<'book' | 'item'>('kind')
  const listPrice = useField<number>('listPrice')
  const listCurrency = useField<string>('listCurrency')
  const priceOverride = useField<number>('priceOverride')
  const discount = useField<number>('discount')
  const saleDiscount = useField<number>('saleDiscount')
  const saved = useField<number>('price')
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [lots, setLots] = useState<StockLot[]>([])

  useEffect(() => {
    let live = true
    fetch('/api/globals/pricing?depth=0', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Pricing | null) => live && p && setPricing(p))
      .catch(() => undefined)
    if (id) {
      fetch(`/api/stock-lots?where[edition][equals]=${id}&where[remaining][greater_than]=0&sort=receivedAt&limit=20&depth=0`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { docs?: StockLot[] } | null) => live && setLots(res?.docs ?? []))
        .catch(() => undefined)
    }
    return () => {
      live = false
    }
  }, [id])

  if (!pricing) return null
  const sale = saleDiscount ?? 0
  const next = pricesFor(
    { kind: kind ?? 'book', listPrice, listCurrency: listCurrency as never, priceOverride, discount, price: saved },
    pricing,
    sale,
  )
  const { price, compareAtPrice } = next
  const off = discountPercent(price, compareAtPrice)
  const own = typeof discount === 'number' && discount >= 0
  const shop = kind === 'item' ? 0 : pricing.defaultDiscount
  const applied = effectiveDiscount(discount, shop, sale)
  const base = own ? discount! : shop
  const why = priceOverride ? 'fixed price' : !applied ? 'no discount' : sale > base ? 'group discount' : own ? 'this book’s discount' : 'shop discount'
  const noRate = listPrice && listCurrency && next.originalPrice === null

  const cost = lots[0]?.landedCost ?? null
  const margin = price && cost !== null ? price - cost : null
  const marginPct = margin !== null && price ? Math.round((margin / price) * 100) : null
  const low = marginPct !== null && marginPct < (pricing.minimumMargin ?? 20)

  const label = { fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.08em', opacity: 0.7 }
  return (
    <div style={{ margin: '0.25rem 0 1.5rem', padding: '0.85rem 1rem', border: '1px solid var(--theme-elevation-150)', borderRadius: 4, background: 'var(--theme-elevation-50)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 2.5rem' }}>
        <div>
          <div style={label}>Customers see</div>
          {price ? (
            <div style={{ marginTop: 4, fontSize: 20, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              {compareAtPrice ? <s style={{ opacity: 0.6 }}>{formatTaka(compareAtPrice)}</s> : null}
              <strong>{formatTaka(price)}</strong>
              {off ? <span style={{ color: '#d22b2f', fontSize: 14, fontWeight: 600 }}>{off}% off</span> : null}
            </div>
          ) : (
            <div style={{ marginTop: 4, opacity: 0.8 }}>No price yet. Enter the printed price and currency, or a fixed price.</div>
          )}
          {price ? <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>{applied && !priceOverride ? `${applied}% · ` : ''}{why}</div> : null}
        </div>
        {price && cost !== null ? (
          <div>
            <div style={label}>You make</div>
            <div style={{ marginTop: 4, fontSize: 20, color: low ? '#d22b2f' : undefined }}>
              <strong>{formatTaka(margin!)}</strong> <span style={{ fontSize: 14 }}>({marginPct}%)</span>
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>
              Next copy cost {formatTaka(cost)}
              {lots[0]?.estimated ? ' (estimated)' : ''}
            </div>
          </div>
        ) : null}
      </div>
      {low ? (
        <div style={{ marginTop: 8, fontSize: 13, color: '#d22b2f' }}>
          Below your {pricing.minimumMargin ?? 20}% minimum margin (Settings → Pricing rules). Consider a smaller discount.
        </div>
      ) : null}
      {noRate ? (
        <div style={{ marginTop: 6, fontSize: 13, color: '#d22b2f' }}>There is no rate for {listCurrency} in Settings → Pricing rules, so the listed price cannot be worked out.</div>
      ) : null}
      {lots.length ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--theme-elevation-150)', fontSize: 13 }}>
          <span style={{ opacity: 0.7 }}>On the shelf, oldest first: </span>
          {lots.map((l, i) => (
            <span key={l.id}>
              {i ? ' · ' : ''}
              <Link href={`/admin/collections/stock-lots/${l.id}`}>{l.code}</Link> {l.remaining} left
              {l.listPrice ? `, printed ${SYMBOL[l.listCurrency ?? ''] ?? ''}${l.listPrice}` : ''}
              {l.landedCost !== null && l.landedCost !== undefined ? `, ${formatTaka(l.landedCost)} each` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
