# AFTERWORD

Online bookshop: storefront, admin and commerce rules in one application.
Next.js + Payload CMS + PostgreSQL. The full plan is in the project proposal.

## Run it on this machine

Needs Node 24.22 or newer (`nvm use` picks the right version), pnpm 11 and a local PostgreSQL.

```bash
createdb afterword        # once
cp .env.example .env      # once, then fill in the two values
pnpm install
pnpm seed                 # loads about 200 real books as sample data (takes about five minutes)
pnpm seed:content         # sample menu, journal articles, About and Help pages; also builds the search index
pnpm dev                  # starts the search engine too, if Meilisearch is installed
```

Search uses Meilisearch (`brew install meilisearch`); `pnpm dev` starts it and stops it with the server
(`pnpm search` starts it on its own). Without it the shop still works: search, suggestions and grids fall
back to the database, without filters or typo tolerance. `pnpm dev:web` starts only the website.

- Shop: http://localhost:3000
- Admin: http://localhost:3000/admin — the first account you create becomes the Owner.

Other commands: `pnpm test` (unit tests), `pnpm typecheck`, `pnpm generate:types` (after changing the data model), `pnpm search:reindex` (rebuild the search index from the database), `pnpm check:orders` (end-to-end test of the order and report rules on your local database; cleans up after itself), `pnpm import:catalogue books.csv` (load books from a spreadsheet), `pnpm covers:copy` (copy covers into the shop's own image store), `sh scripts/backup.sh` / `sh scripts/restore.sh` (backups), `node scripts/check-access.mjs URL` (checks nothing private is readable without signing in).

## Guides

- [docs/production.md](docs/production.md): going live on a Hostinger KVM 2 server, step by step, and every account the shop needs
- [docs/runbook.md](docs/runbook.md): routine jobs, what to do when something breaks, launch checklist, soft launch
- [docs/staff-handbook.md](docs/staff-handbook.md): day-to-day work in the admin, by role
- [docs/growth.md](docs/growth.md): reviews, reward points, shopping feeds, direct bKash and the newsletter: how each works and how to switch it on

## What is where

| Path | What it holds |
| --- | --- |
| `src/collections`, `src/globals` | The data model: books, authors, subjects, collections, notes, stock ledger, staff, settings |
| `src/access/roles.ts` | Staff roles and who may do what |
| `src/lib/pricing.ts` | List price to taka price |
| `src/lib/availability.ts` | In stock / Pre-order / On Request, worked out from stock |
| `src/lib/isbn` | ISBN checks, book-data sources and the "add a book by ISBN" importer |
| `src/lib/orders` | Order arithmetic, stock reservation, and the actions that move an order along |
| `src/lib/bag.ts`, `src/lib/session.ts`, `src/lib/otp.ts` | The bag, customer sessions and one-time sign-in codes |
| `src/lib/notify.ts`, `src/lib/payments` | Text messages and the SSLCommerz adapter (both waiting for provider accounts) |
| `src/lib/catalogue.ts` | Every database query the storefront makes |
| `src/lib/search`, `src/lib/browse.ts` | The search index, filters and sorting, and the database fallback |
| `src/app/(frontend)` | The shop's pages. Design tokens are at the top of `globals.css` |
| `src/app/(payload)` | The admin (provided by Payload) |
| `src/components/site` | Header, footer, covers, book cards, shelves |
| `src/seed` | Sample catalogue for the preview site |

## Sample data — replace before launch

The seed loads real titles, covers and descriptions from Open Library and Google Books.
These values are placeholders, not AFTERWORD's real ones:

- list prices and the exchange rates in **Settings → Pricing rules**
- stock levels (the "Sample opening stock" movements)
- the bookseller notes signed "Sample note"
- the Marginalia articles (byline "Sample article"), author notes, subject introductions, and the About and Help pages

## Connecting outside services

Set these in `.env` when the accounts exist. Until then the shop runs without them.

| Service | Settings | Without it |
| --- | --- | --- |
| bKash (direct) | `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_LIVE=true` for real payments | See SSLCommerz |
| SSLCommerz | `SSLCZ_STORE_ID`, `SSLCZ_STORE_PASSWORD`, `SSLCZ_LIVE=true` for real payments | With neither connected, advances are sent by bKash Send Money to the number in Shop settings and checked by staff |
| Email (Lark Mail) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Staff password resets and newsletter welcome emails are written to the server log |
| SMS | Implement a provider in `src/lib/notify.ts` | Messages are logged under Orders → Messages sent; sign-in codes are shown on screen on a development machine only |
| Site address | `NEXT_PUBLIC_SITE_URL` | Links in messages point to localhost |
