import type { Access, FieldAccess } from 'payload'

/**
 * Staff roles. "owner" can do everything; the others are additive.
 * See the proposal, section 6 (Staff roles).
 */
export const ROLES = ['owner', 'manager', 'catalogue', 'orders', 'warehouse', 'writer'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_OPTIONS: { label: string; value: Role }[] = [
  { label: 'Owner — everything, including staff and settings', value: 'owner' },
  { label: 'Manager — everything except staff and payment settings', value: 'manager' },
  { label: 'Catalogue editor — books, authors, pricing, collections', value: 'catalogue' },
  { label: 'Order desk — orders, customers, courier booking', value: 'orders' },
  { label: 'Warehouse — stock, receiving, packing', value: 'warehouse' },
  { label: 'Writer — journal, bookseller notes, pages', value: 'writer' },
]

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: string[] | null } | null | undefined)?.roles
  return Array.isArray(roles) ? roles : []
}

/** True when the user is an owner or holds any of the given roles. */
export const userHasRole = (user: unknown, ...roles: Role[]): boolean => {
  const held = rolesOf(user)
  return held.includes('owner') || roles.some((role) => held.includes(role))
}

/** Collection access: signed-in staff holding one of these roles (owners always pass). */
export const allow =
  (...roles: Role[]): Access =>
  ({ req }) =>
    userHasRole(req.user, ...roles)

export const allowField =
  (...roles: Role[]): FieldAccess =>
  ({ req }) =>
    userHasRole(req.user, ...roles)

export const anyone: Access = () => true
export const nobody: Access = () => false
export const isStaff: Access = ({ req }) => Boolean(req.user)

/** Public visitors see published records only; staff see everything. */
export const publishedOrStaff: Access = ({ req }) =>
  req.user ? true : { status: { equals: 'published' } }
