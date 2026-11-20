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
  upload: {
    staticDir: MEDIA_DIR,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
    formatOptions: { format: 'webp', options: { quality: 82 } },
  },
}
