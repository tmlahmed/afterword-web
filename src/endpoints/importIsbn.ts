import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'
import { importBook } from '../lib/isbn/importBook'

/**
 * POST /api/editions/import-isbn  { "isbn": "9780099448822" }
 * Adds a book as a draft from its ISBN. Staff with catalogue rights only.
 */
export const importIsbnEndpoint: Endpoint = {
  path: '/import-isbn',
  method: 'post',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager', 'catalogue')) {
      return Response.json({ message: 'You do not have permission to add books.' }, { status: 403 })
    }
    let isbn = ''
    try {
      const body = (await req.json?.()) as { isbn?: unknown } | undefined
      isbn = typeof body?.isbn === 'string' ? body.isbn : ''
    } catch {
      // fall through to the validation message below
    }
    if (!isbn.trim()) {
      return Response.json({ message: 'Enter an ISBN.' }, { status: 400 })
    }

    const result = await importBook(req.payload, isbn, { req })
    if (!result.ok) {
      return Response.json({ message: result.message }, { status: result.reason === 'invalid_isbn' ? 400 : 404 })
    }
    return Response.json({
      id: result.edition.id,
      title: result.edition.title,
      created: result.created,
      message: result.created
        ? `Added "${result.edition.title}" as a draft. Check the details, set a price, then publish.`
        : `"${result.edition.title}" is already in the catalogue.`,
    })
  },
}
