import type { CollectionConfig } from 'payload'

import { allow, allowField, isStaff, ROLE_OPTIONS, userHasRole } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Staff member', plural: 'Staff' },
  admin: {
    useAsTitle: 'name',
    group: 'Settings',
    defaultColumns: ['name', 'email', 'roles'],
    description: 'People who can sign in to this admin. Customers are kept separately.',
  },
  auth: {
    // Five wrong passwords lock the account for fifteen minutes.
    maxLoginAttempts: 5,
    lockTime: 15 * 60_000,
    tokenExpiration: 12 * 60 * 60,
    cookies: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: {
    admin: ({ req }) => Boolean(req.user),
    read: isStaff,
    create: allow('owner'),
    // Owners manage everyone; everyone else can edit only their own record.
    update: ({ req }) => {
      if (userHasRole(req.user, 'owner')) return true
      return req.user ? { id: { equals: req.user.id } } : false
    },
    delete: allow('owner'),
  },
  hooks: {
    beforeChange: [
      // The very first account created becomes the owner.
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const existing = await req.payload.count({ collection: 'users', req })
        if (existing.totalDocs === 0) return { ...data, roles: ['owner'] }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['writer'],
      options: ROLE_OPTIONS,
      saveToJWT: true,
      admin: { description: 'The first account created always becomes the Owner, whatever is chosen here.' },
      access: {
        create: allowField('owner'),
        update: allowField('owner'),
      },
    },
  ],
}
