import type { Metadata } from 'next'
import React from 'react'

import { ProductReviewsPage, productReviewsMetadata } from '../../../../../components/site/ProductReviewsPage'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return productReviewsMetadata((await params).slug)
}

/** Every review of one book, with the book beside them to buy. */
export default async function BookReviewsPage({ params }: Props) {
  return <ProductReviewsPage slug={(await params).slug} route="book" />
}
