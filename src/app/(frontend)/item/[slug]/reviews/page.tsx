import type { Metadata } from 'next'
import React from 'react'

import { ProductReviewsPage, productReviewsMetadata } from '../../../../../components/site/ProductReviewsPage'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return productReviewsMetadata((await params).slug)
}

/** Every review of one item, with the item beside them to buy. */
export default async function ItemReviewsPage({ params }: Props) {
  return <ProductReviewsPage slug={(await params).slug} route="item" />
}
