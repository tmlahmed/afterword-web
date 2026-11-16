import type { Block, CollectionConfig, Field } from 'payload'

import { allow, publishedOrStaff } from '../access/roles'
import { slugify } from '../lib/slug'

const slug = (from: string): Field =>
  ({
    name: 'slug',
    type: 'text',
    unique: true,
    index: true,
    required: true,
    admin: { position: 'sidebar', description: 'Used in the page address. Filled in automatically.' },
    hooks: {
      beforeValidate: [
        ({ value, data }: { value?: unknown; data?: Record<string, unknown> }) =>
          slugify(String(value || data?.[from] || '')),
      ],
    },
  })

const status: Field = {
  name: 'status',
  type: 'select',
  required: true,
  defaultValue: 'draft',
  index: true,
  options: [
    { label: 'Draft — hidden from the shop', value: 'draft' },
    { label: 'Published', value: 'published' },
  ],
  admin: { position: 'sidebar' },
}

const contentAccess = {
  read: publishedOrStaff,
  create: allow('manager', 'writer'),
  update: allow('manager', 'writer'),
  delete: allow('manager'),
}

/** Marginalia — the journal. Every piece can carry books that are buyable from the page. */
export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Marginalia article', plural: 'Marginalia' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'kind', 'publishedAt', 'status'],
    description: 'The journal: essays, reading lists, interviews and extracts.',
  },
  access: contentAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    slug('title'),
    status,
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'list',
      options: [
        { label: 'Reading list', value: 'list' },
        { label: 'Essay', value: 'essay' },
        { label: 'Interview', value: 'interview' },
        { label: 'Extract', value: 'extract' },
        { label: 'News', value: 'news' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' } },
    },
    { name: 'byline', type: 'text', admin: { position: 'sidebar', description: 'Who wrote it.' } },
    {
      name: 'standfirst',
      type: 'textarea',
      required: true,
      maxLength: 300,
      admin: { description: 'One or two sentences under the headline, also shown on cards.' },
    },
    { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Optional. Without one, the first book’s cover is used.' } },
    { name: 'body', type: 'richText', required: true },
    {
      name: 'books',
      type: 'relationship',
      relationTo: 'editions',
      hasMany: true,
      admin: { description: 'Books mentioned in the piece. Shown as a shelf at the end, in this order.' },
    },
  ],
}

const TextBlock: Block = {
  slug: 'text',
  labels: { singular: 'Text', plural: 'Text' },
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'body', type: 'richText', required: true },
  ],
}

const ShelfBlock: Block = {
  slug: 'shelf',
  labels: { singular: 'Shelf of books', plural: 'Shelves of books' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'intro', type: 'text' },
    { name: 'list', type: 'relationship', relationTo: 'lists', required: true, label: 'Collection' },
  ],
}

const NoteBlock: Block = {
  slug: 'note',
  labels: { singular: 'Bookseller note', plural: 'Bookseller notes' },
  fields: [{ name: 'note', type: 'relationship', relationTo: 'notes', required: true }],
}

const QuestionsBlock: Block = {
  slug: 'questions',
  labels: { singular: 'Questions and answers', plural: 'Questions and answers' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'items',
      type: 'array',
      required: true,
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'textarea', required: true },
      ],
    },
  ],
}

export const PAGE_BLOCKS = [TextBlock, ShelfBlock, NoteBlock, QuestionsBlock]

/** Free-standing pages built from blocks: About, Help, Delivery, Returns, campaign pages. */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'slug', 'status'],
    description: 'Pages assembled from blocks. The address is afterword…/your-slug.',
  },
  access: contentAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    slug('title'),
    status,
    { name: 'intro', type: 'textarea', admin: { description: 'Shown under the title.' } },
    { name: 'layout', type: 'blocks', blocks: PAGE_BLOCKS, labels: { singular: 'Block', plural: 'Blocks' } },
  ],
}
