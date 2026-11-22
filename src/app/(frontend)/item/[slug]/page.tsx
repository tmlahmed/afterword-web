import type { Metadata } from 'next'
import React from 'react'

import { ProductPage, productMetadata } from '../../../../components/site/ProductPage'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return productMetadata((await params).slug)
}

/** A gift or stationery item's page. Books opened here are sent to /book/…. */
export default async function ItemPage({ params }: Props) {
  return <ProductPage slug={(await params).slug} route="item" />
}
