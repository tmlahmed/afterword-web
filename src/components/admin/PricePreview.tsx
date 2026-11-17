'use client'

import { useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { computePrice, derivePrices, discountPercent, formatTaka, type PricingRules } from '../../lib/pricing'

/**
 * "Customers see: ৳1,200 ৳1,020 · 15% off", updated as staff type, so nobody has to work out
 * what a list price, currency rate and selling price add up to.
 */
export const PricePreview: React.FC = () => {
  const listPrice = useFormFields(([fields]) => fields.listPrice?.value as number | undefined)
  const currency = useFormFields(([fields]) => fields.listCurrency?.value as string | undefined)
  const selling = useFormFields(([fields]) => fields.priceOverride?.value as number | undefined)
  const saved = useFormFields(([fields]) => fields.price?.value as number | undefined)
  const [rules, setRules] = useState<PricingRules | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/globals/pricing?depth=0', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { rates?: { currency: string; rate: number }[]; defaultMargin?: number; roundTo?: number } | null) => {
        if (live && p) setRules({ rates: p.rates ?? [], margin: p.defaultMargin ?? 1, roundTo: p.roundTo ?? 10 })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const original = rules ? computePrice(listPrice, currency, rules) : null
  const { price, compareAtPrice } = derivePrices(original, selling, saved)
  const off = discountPercent(price, compareAtPrice)
  const noRate = rules && listPrice && currency && original === null

  return (
    <div
      style={{
        margin: '0.25rem 0 1.5rem',
        padding: '0.85rem 1rem',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 4,
        background: 'var(--theme-elevation-50)',
      }}
    >
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>Customers see</div>
      {price ? (
        <div style={{ marginTop: 4, fontSize: 20, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {compareAtPrice ? <s style={{ opacity: 0.6 }}>{formatTaka(compareAtPrice)}</s> : null}
          <strong>{formatTaka(price)}</strong>
          {off ? <span style={{ color: '#d22b2f', fontSize: 14, fontWeight: 600 }}>{off}% off</span> : null}
        </div>
      ) : (
        <div style={{ marginTop: 4, opacity: 0.8 }}>No price yet. Enter a list price and currency, or a selling price.</div>
      )}
      {noRate ? (
        <div style={{ marginTop: 6, fontSize: 13, color: '#d22b2f' }}>
          There is no rate for {currency} in Settings → Pricing rules, so the original price cannot be worked out.
        </div>
      ) : null}
      {selling && original && selling > original ? (
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>The selling price is above the original price, so no discount is shown.</div>
      ) : null}
    </div>
  )
}
