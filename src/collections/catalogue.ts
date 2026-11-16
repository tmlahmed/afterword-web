import type { CollectionConfig, Field } from 'payload'

import { allow, anyone } from '../access/roles'
import { slugify } from '../lib/slug'

const catalogueAccess = {
  read: anyone,
  create: allow('manager', 'catalogue'),
  update: allow('manager', 'catalogue'),
  delete: allow('manager'),
}

/** A URL slug filled from another field when left empty. */
const slugField = (from: string): Field => ({
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  required: true,
  admin: { position: 'sidebar', description: 'Used in the page address. Filled in automatically.' },
  hooks: {
    beforeValidate: [
      ({ value, data }) => (value ? slugify(String(value)) : slugify(String(data?.[from] ?? ''))),
    ],
  },
})

export const Contributors: CollectionConfig = {
  slug: 'contributors',
  labels: { singular: 'Author or contributor', plural: 'Authors and contributors' },
  admin: { useAsTitle: 'name', group: 'Catalogue', defaultColumns: ['name', 'updatedAt'] },
  access: catalogueAccess,
  fields: [
    { name: 'name', type: 'text', required: true, index: true },
    slugField('name'),
    { name: 'bio', type: 'textarea', admin: { description: 'Two or three sentences for the author page.' } },
    { name: 'portrait', type: 'upload', relationTo: 'media' },
    { name: 'books', type: 'join', collection: 'editions', on: 'contributors.contributor' },
  ],
}

export const Publishers: CollectionConfig = {
  slug: 'publishers',
  labels: { singular: 'Publisher or imprint', plural: 'Publishers and imprints' },
  admin: { useAsTitle: 'name', group: 'Catalogue' },
  access: catalogueAccess,
  fields: [
    { name: 'name', type: 'text', required: true, index: true },
    slugField('name'),
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'publishers',
      admin: { description: 'For an imprint, the publishing house it belongs to.' },
    },
    { name: 'about', type: 'textarea' },
  ],
}

export const Series: CollectionConfig = {
  slug: 'series',
  labels: { singular: 'Series', plural: 'Series' },
  admin: { useAsTitle: 'name', group: 'Catalogue' },
  access: catalogueAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField('name'),
    { name: 'about', type: 'textarea' },
  ],
}

export const Subjects: CollectionConfig = {
  slug: 'subjects',
  labels: { singular: 'Subject', plural: 'Subjects' },
  admin: {
    useAsTitle: 'name',
    group: 'Catalogue',
    defaultColumns: ['name', 'parent', 'slug'],
    description: 'The shop categories. Two levels only: a main subject and the subjects inside it.',
  },
  access: catalogueAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField('name'),
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'subjects',
      admin: { description: 'Leave empty for a main subject (Fiction, Non-Fiction, Children’s & YA).' },
    },
    { name: 'intro', type: 'textarea', admin: { description: 'Shown at the top of the subject page.' } },
    {
      name: 'feature',
      type: 'relationship',
      relationTo: 'editions',
      label: 'Featured book',
      admin: { description: 'Optional. Shown large on the subject page with its bookseller note.' },
    },
    {
      name: 'shelves',
      type: 'array',
      labels: { singular: 'Curated shelf', plural: 'Curated shelves' },
      admin: {
        description:
          'Hand-picked shelves for this subject, shown first. Automatic shelves (in stock, newest, each sub-subject) follow.',
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'intro', type: 'text' },
        { name: 'list', type: 'relationship', relationTo: 'lists', required: true, label: 'Collection' },
      ],
    },
    {
      name: 'tradeCodes',
      type: 'text',
      hasMany: true,
      admin: {
        description:
          'Book-trade subject codes (BISAC or Thema) that file a book here automatically on import.',
      },
    },
  ],
}

export const Works: CollectionConfig = {
  slug: 'works',
  labels: { singular: 'Work', plural: 'Works' },
  admin: {
    useAsTitle: 'title',
    group: 'Catalogue',
    description:
      'A work is the book as written. Its editions (hardback, paperback, special) are what you sell.',
  },
  access: catalogueAccess,
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    slugField('title'),
    { name: 'firstPublished', type: 'number', admin: { description: 'Year first published.' } },
    { name: 'sourceKey', type: 'text', index: true, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'editions', type: 'join', collection: 'editions', on: 'work' },
  ],
}

export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  admin: { useAsTitle: 'name', group: 'Stock and purchasing' },
  access: {
    read: allow('manager', 'catalogue', 'warehouse'),
    create: allow('manager'),
    update: allow('manager'),
    delete: allow('manager'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'country', type: 'text' },
    {
      name: 'currency',
      type: 'select',
      options: ['GBP', 'USD', 'INR', 'EUR', 'BDT'],
      admin: { description: 'The currency this supplier invoices in.' },
    },
    {
      name: 'leadTimeWeeks',
      type: 'number',
      min: 0,
      admin: { description: 'Typical weeks from order to arrival in Dhaka.' },
    },
    {
      name: 'margin',
      type: 'number',
      min: 0,
      admin: { description: 'Optional. Overrides the default margin for books from this supplier.' },
    },
    { name: 'notes', type: 'textarea' },
  ],
}
