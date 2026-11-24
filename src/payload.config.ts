import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { CatalogueImports } from './collections/CatalogueImports'
import { Contributors, Publishers, Series, Subjects, Suppliers, Works } from './collections/catalogue'
import { Carts, Customers, Messages, Orders, OtpCodes, Promotions, PurchaseOrders, Requests } from './collections/commerce'
import { Articles, Pages } from './collections/content'
import { Reviews, RewardEntries, Subscribers } from './collections/growth'
import { Editions } from './collections/Editions'
import { Media } from './collections/Media'
import { Lists, Notes, SearchMisses, StockMovements } from './collections/shop'
import { Users } from './collections/Users'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'

import { healthEndpoint } from './endpoints/health'
import { reportsCsvEndpoint } from './endpoints/reports'
import { Home, Navigation, Pricing, SiteSettings } from './globals'
import { GroupDiscounts } from './collections/GroupDiscounts'
import { StockLots } from './collections/StockLots'
import { Notifications } from './collections/Notifications'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const production = process.env.NODE_ENV === 'production'
const serverURL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

// A weak or missing secret would let anyone forge staff and customer sessions.
if (production && process.env.NEXT_PHASE !== 'phase-production-build') {
  const secret = process.env.PAYLOAD_SECRET ?? ''
  if (secret.length < 32 || secret.startsWith('replace-with')) {
    throw new Error('PAYLOAD_SECRET must be set to a random string of at least 32 characters.')
  }
}

export default buildConfig({
  serverURL,
  // Staff sessions are cookies; only accept them from the shop's own address.
  csrf: [serverURL],
  cors: [serverURL],
  // The shop does not use GraphQL, so it is switched off rather than left open.
  graphQL: { disable: true },
  upload: { limits: { fileSize: 10_000_000 } },
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' · AFTERWORD',
      icons: [
        { rel: 'icon', type: 'image/svg+xml', url: '/brand/afterword-icon.svg' },
        { rel: 'apple-touch-icon', url: '/brand/afterword-apple-icon.png' },
      ],
    },
    components: {
      // Our own side menu (Dashboard and Reports first, icons, counts) and first screen.
      Nav: '/components/admin/Nav#AdminNav',
      // The bell at the top right: new orders, payments to check, requests, reviews…
      actions: ['/components/admin/NotificationBell#NotificationBell'],
      graphics: { Logo: '/components/admin/Logo#AdminLogo', Icon: '/components/admin/Logo#AdminIcon' },
      views: {
        dashboard: { Component: '/components/admin/Dashboard#Dashboard' },
        reports: { Component: '/components/admin/Reports#Reports', path: '/reports', meta: { title: 'Reports' } },
        toOrder: { Component: '/components/admin/ToOrder#ToOrder', path: '/to-order', meta: { title: 'To order' } },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    // Catalogue
    Editions,
    Works,
    Contributors,
    Publishers,
    Series,
    Subjects,
    CatalogueImports,
    SearchMisses,
    // Content
    Lists,
    Notes,
    Articles,
    Pages,
    Reviews,
    Subscribers,
    Media,
    // Orders
    Orders,
    Requests,
    Customers,
    Promotions,
    GroupDiscounts,
    RewardEntries,
    Messages,
    // Stock and purchasing
    StockMovements,
    StockLots,
    Notifications,
    PurchaseOrders,
    Suppliers,
    // Internal
    Carts,
    OtpCodes,
    // Settings
    Users,
  ],
  globals: [Home, Navigation, SiteSettings, Pricing],
  endpoints: [reportsCsvEndpoint, healthEndpoint],
  // Staff password-reset emails. Without SMTP settings, emails are written to the server log.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM || 'shop@example.com',
        defaultFromName: 'AFTERWORD',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          // Port 465 (Lark Mail, many others) is encrypted from the start; 587 upgrades with STARTTLS.
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        },
      })
    : undefined,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
