'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { CatalogueImport } from './CatalogueImport'
import { ImportIsbn } from './ImportIsbn'

/**
 * The fast ways to add books, at the top of a new book's page: look one up by ISBN (it is
 * filled in for you and opened), or import a whole spreadsheet. The form below is for adding
 * a book by hand. Hidden once the book exists.
 */
export const QuickAdd: React.FC = () => {
  const { id } = useDocumentInfo()
  if (id) return null
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          background: 'var(--theme-elevation-50)',
          borderRadius: 4,
          padding: '1.25rem 1.25rem 0.25rem',
          marginBottom: '1rem',
          maxWidth: '52rem',
        }}
      >
        <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>The quick way: start from the ISBN</p>
        <p style={{ margin: '0 0 1rem', opacity: 0.75, fontSize: 13 }}>
          Title, author, publisher, description and cover are filled in for you from the book databases, and the book opens as a
          draft to check and price.
        </p>
        <ImportIsbn />
      </div>
      <CatalogueImport />
      <p style={{ margin: '1.5rem 0 0', opacity: 0.75, fontSize: 13 }}>Or fill in the form below by hand.</p>
    </div>
  )
}
