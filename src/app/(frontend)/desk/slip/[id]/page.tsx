import config from '@payload-config'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { userHasRole } from '../../../../../access/roles'
import { linesIn, PARCEL_NAME, parcelsOf } from '../../../../../lib/orders/parcels'
import { formatTaka } from '../../../../../lib/pricing'
import type { Edition } from '../../../../../payload-types'

export const metadata: Metadata = { title: 'Packing slip', robots: { index: false } }

/** Printable packing slip and pick list. Staff only. Gift orders leave the prices off. */
export default async function SlipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ parcel?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!userHasRole(user, 'manager', 'orders', 'warehouse')) notFound()
  const order = await payload.findByID({ collection: 'orders', id: Number(id), depth: 1, overrideAccess: true, disableErrors: true })
  if (!order) notFound()
  const gift = Boolean(order.giftWrap)
  // One slip per parcel when the order goes in two.
  const parcels = parcelsOf(order)
  const index = Math.min(Math.max(0, Number(query.parcel) || 0), parcels.length - 1)
  const parcel = parcels[index]
  const lines = parcels.length > 1 ? linesIn(order.lines, index) : (order.lines ?? [])

  return (
    <div className="mx-auto max-w-2xl bg-white px-8 py-10 text-[0.9375rem] text-black print:px-0">
      <style>{`header, footer, nav, body > a, [aria-label="Main"] { display: none !important } body, html { background: #fff !important }`}</style>
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <p className="font-display text-[1.5rem] uppercase tracking-[0.2em]">Afterword.</p>
          <p className="text-[0.8125rem]">Original editions, delivered across Bangladesh</p>
        </div>
        <div className="text-right">
          <p className="text-[1.25rem] font-semibold">{order.number}</p>
          {parcels.length > 1 ? <p className="font-semibold">{PARCEL_NAME(index, parcels.length)} of 2</p> : null}
          <p>{new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-widest">Deliver to</p>
          <p className="mt-1 text-[1.0625rem] font-semibold">{order.contactName}</p>
          <p>{order.contactPhone}</p>
          <p className="whitespace-pre-line">{order.street}</p>
          <p>
            {order.area}, {order.district}
          </p>
          {order.deliveryNote ? <p className="mt-1 italic">Note: {order.deliveryNote}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-widest">Courier collects</p>
          <p className="mt-1 text-[1.75rem] font-semibold">{formatTaka(parcel?.collect ?? 0)}</p>
          {parcels.length > 1 && index === 1 ? <p className="text-[0.8125rem]">Delivery already paid with parcel 1</p> : null}
          {gift ? <p className="mt-1 font-semibold">GIFT WRAP{order.giftNote ? ` · card: “${order.giftNote}”` : ''}</p> : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left text-[0.6875rem] uppercase tracking-widest">
            <th className="py-2 pr-2">☐</th>
            <th className="py-2">Book</th>
            <th className="py-2">ISBN</th>
            <th className="py-2 text-right">Qty</th>
            {gift ? null : <th className="py-2 text-right">Price</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-neutral-300 align-top">
              <td className="py-2 pr-2">☐</td>
              <td className="py-2">
                <span className="font-semibold">{l.title}</span>
                <span className="block text-[0.8125rem]">
                  {l.authorLine} · {(typeof l.edition === 'object' ? (l.edition as Edition).format : '') || ''}
                  {l.allocated ? '' : ' · NOT YET IN STOCK'}
                </span>
              </td>
              <td className="py-2 tabular-nums">{l.isbn13}</td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              {gift ? null : <td className="py-2 text-right tabular-nums">{formatTaka((l.unitPrice ?? 0) * l.quantity)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {gift ? null : (
        <p className="mt-4 text-right">
          Books {formatTaka(order.subtotal ?? 0)}
          {order.discount ? ` · discount −${formatTaka(order.discount)}` : ''} · delivery {order.delivery ? formatTaka(order.delivery) : 'free'} ·{' '}
          <strong>total {formatTaka(order.total ?? 0)}</strong>
          {(order.paid ?? 0) > 0 ? ` · paid ${formatTaka(order.paid ?? 0)}` : ''}
        </p>
      )}
      <p className="mt-8 border-t border-neutral-300 pt-3 text-center text-[0.8125rem]">
        Every book we sell is a genuine publisher’s edition. Thank you for reading with us.
      </p>
    </div>
  )
}
