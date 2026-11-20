import path from 'path'
import type { CollectionConfig } from 'payload'

import { allow, anyone } from '../access/roles'

/** Where uploaded images are kept on disk. Set MEDIA_DIR on the server; backups read the same folder. */
export const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  access: {
    read: anyone,
    create: allow('manager', 'catalogue', 'writer'),
    update: allow('manager', 'catalogue', 'writer'),
    delete: allow('manager'),
  },
  fields: [{ name: 'alt', type: 'text', required: true }],
  hooks: {
    // When the file inside an upload is replaced, books using it as their cover show the new one.
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update' || !doc.filename || doc.filename === previousDoc?.filename) return doc
        const coverUrl = `/api/media/file/${encodeURIComponent(doc.filename)}`
        const books = await req.payload.find({ collection: 'editions', where: { cover: { equals: doc.id } }, depth: 0, pagination: false, req, overrideAccess: true, select: { slug: true } })
        for (const book of books.docs) {
          await req.payload.update({ collection: 'editions', id: book.id, data: { coverUrl }, depth: 0, req, overrideAccess: true })
        }
        return doc
      },
    ],
  },
  upload: {
    staticDir: MEDIA_DIR,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
    formatOptions: { format: 'webp', options: { quality: 82 } },
  },
}
