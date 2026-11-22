import type { Metadata } from 'next'
import React from 'react'

import { ProductPage, productMetadata } from '../../../../components/site/ProductPage'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return productMetadata((await params).slug)
}

/** A book's page. Gifts and stationery opened here are sent to /item/…. */
export default async function BookPage({ params }: Props) {
  return <ProductPage slug={(await params).slug} route="book" />
}
