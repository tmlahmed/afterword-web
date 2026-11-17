import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import React from 'react'

import { CheckoutForm } from '../../../components/site/Forms'
import { PageHeading } from '../../../components/site/PageHeading'
import { getBag, plansFor } from '../../../lib/bag'
import { getSettings } from '../../../lib/catalogue'
import { pointsToSpend } from '../../../lib/orders/pricing'
import { payMethods } from '../../../lib/payments'
import { getCustomer } from '../../../lib/session'

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } }

export default async function CheckoutPage() {
  const [customer, bag, settings] = await Promise.all([getCustomer(), getBag(), getSettings()])
  if (bag.lines.length === 0 || bag.lines.some((l) => l.problem)) redirect('/bag')
  if (!customer) redirect('/account/sign-in?next=/checkout')

  const inside = bag.totals('inside_dhaka')
  const outside = bag.totals('outside_dhaka')
  const hasBackorder = bag.lines.some((l) => l.kind !== 'in_stock')
  const methods = payMethods(settings.bkashNumber)

  // Reward points: books after any promotion are the same in both zones.
  const balance = customer.rewardPoints ?? 0
  const usable = pointsToSpend(balance, inside.subtotal - inside.discount, bag.rewards)
  const insidePts = bag.totals('inside_dhaka', usable)
  const outsidePts = bag.totals('outside_dhaka', usable)

  return (
    <>
      <PageHeading eyebrow="Checkout" title="Almost there" />
      <div className="mx-auto max-w-6xl px-4">
        <CheckoutForm
          customer={{
            phone: customer.phone,
            name: customer.name,
            email: customer.email,
            district: customer.address?.district,
            area: customer.address?.area,
            street: customer.address?.street,
          }}
          rules={{ ...bag.rules, insideDays: settings.insideDhakaDays ?? '', outsideDays: settings.outsideDhakaDays ?? '' }}
          totals={{ inside_dhaka: inside, outside_dhaka: outside }}
          plans={{ inside_dhaka: plansFor(inside), outside_dhaka: plansFor(outside) }}
          withPoints={{
            totals: { inside_dhaka: insidePts, outside_dhaka: outsidePts },
            plans: { inside_dhaka: plansFor(insidePts), outside_dhaka: plansFor(outsidePts) },
          }}
          points={{ balance: bag.rewards.enabled ? balance : 0, usable, minimum: bag.rewards.redeemMinimum }}
          methods={methods}
          lines={bag.lines.map((l) => ({ unitPrice: l.edition.price ?? 0, quantity: l.quantity, kind: l.kind }))}
          bkashNumber={settings.bkashNumber}
          needsAdvanceBecause={
            hasBackorder
              ? `We order some of your books in specially, so we ask for ${settings.advancePercent ?? 50}% of their price now.`
              : null
          }
        />
      </div>
    </>
  )
}
