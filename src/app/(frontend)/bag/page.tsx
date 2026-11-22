import type { Metadata } from 'next'
import React from 'react'

import { BagView } from '../../../components/site/BagView'
import { getBag } from '../../../lib/bag'
import { productHref } from '../../../lib/links'

export const metadata: Metadata = { title: 'Your bag', robots: { index: false } }

export default async function BagPage() {
  const bag = await getBag()
  return (
    <BagView
      lines={bag.lines.map((l) => ({
        id: l.edition.id,
        title: l.edition.title,
        slug: l.edition.slug,
        href: productHref(l.edition),
        authorLine: l.edition.authorLine,
        coverUrl: l.edition.coverUrl,
        unitPrice: l.edition.price ?? 0,
        quantity: l.quantity,
        max: l.kind === 'in_stock' ? Math.min(20, l.edition.stockOnHand ?? 0) : 20,
        kind: l.kind,
        note: l.note,
        soldOut: l.soldOut,
      }))}
      rules={bag.rules}
      promotion={bag.promotion}
      giftWrap={bag.giftWrap}
      giftNote={bag.giftNote}
    />
  )
}
