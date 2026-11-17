# AFTERWORD runbook

How to keep the shop running and what to do when something goes wrong. For setting up the server, see [production.md](production.md). For day-to-day shop work, see [staff-handbook.md](staff-handbook.md).

## Routine

| When | What | How |
|---|---|---|
| Every morning | Look at **Today's desk** (the first admin screen) | Orders to confirm, payments to check, parcels with couriers |
| Daily, automatic | Backup at 03:15 | `scripts/backup.sh` from cron; check `backups/backup.log` now and then |
| Weekly | Read **Reports → Money still to come in** | Match cash the couriers say they hold against their payout statements |
| Daily | Check **reviews to check** on Today's desk | Publish or decline new reviews |
| Before each newsletter | Download a fresh subscriber list | Content → Newsletter subscribers → Download (unsubscribes are left out) |
| Weekly | Clear **Searches with no results** you have dealt with | Catalogue → Searches with no results |
| Monthly | **Test a restore** (below) | 15 minutes; a backup that has never been restored is a hope, not a backup |
| Monthly | Update the code's libraries | `pnpm outdated`, `pnpm audit --prod`, update, try on staging, then deploy |
| Monthly | Run the access audit against the live site | `node scripts/check-access.mjs https://your-domain` |
| When exchange rates move | Update **Settings → Pricing rules** | Books are re-priced the next time each one is saved |

## Deploying a change

1. Try it locally: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Run `pnpm check:orders` if the change touches orders, stock or reports. Leave the shop settings alone while it runs: the test creates and then removes its own orders.
2. Try it on staging.
3. On the live server: `sh scripts/backup.sh`, then `git pull`, `pnpm install --frozen-lockfile`, `pnpm payload migrate`, `pnpm build`, and restart the service.
4. Open the home page, a book page and the admin. Check `/api/health`.

Deploy in a quiet hour; Dhaka late evening is usually best. A restart takes the shop away for a few seconds.

## Useful commands (from the project folder)

| Command | What it does |
|---|---|
| `pnpm import:catalogue books.csv` | Load or update books from a spreadsheet. Safe to run again; carries on where it stopped |
| `pnpm covers:copy` | Copy any covers still linked to Open Library or Google into the shop's own image store |
| `pnpm search:reindex` | Rebuild the search index from the database. Run after a restore, or if search looks wrong |
| `sh scripts/backup.sh` | Back up the database and images now |
| `sh scripts/restore.sh backups/FILE.dump` | Replace the database with a backup (asks you to type RESTORE) |
| `node scripts/check-access.mjs URL` | Check that nothing private can be read without signing in |
| `pnpm check:orders` | End-to-end test of ordering, stock and reports. **Local or staging only, never live**: it creates real test orders before removing them |

## When something goes wrong

**The shop does not load.**
0. If you cannot even reach the server over SSH, open the **Hostinger panel → VPS**. Use the **browser terminal**, or **Restart** the server from there. The shop, database and search all start again on their own after a reboot.
1. Look at `https://your-domain/api/health`.
   - No answer at all: the application or the server is down. On the server, run `systemctl status afterword` and `journalctl -u afterword -n 100`. Restart with `sudo systemctl restart afterword`.
   - `"database": false`: PostgreSQL is down or the disk is full. Run `systemctl status postgresql` and `df -h`.
2. If the disk is full, the usual cause is old backups or logs. Delete the oldest files in `backups/` (they are also copied off-site) and run `sudo journalctl --vacuum-time=14d`.

**Search shows nothing or old results.** Search runs on Meilisearch. If it is down, the shop falls back to plain database search without filters, so customers can still find books. Run `systemctl status meilisearch`, restart it, then run `pnpm search:reindex`.

**Prices look wrong.** Check **Settings → Pricing rules** (exchange rates and margin) and the book's **Selling price**. A book's original price is recalculated only when the book is saved, so after changing exchange rates, re-save the books you want re-priced.

**Stock looks wrong.** Stock is the sum of the book's stock movements, which you can see on the book's page. Never change it directly. Add a **Stock count correction** movement with a note. If the stock figure and the ledger ever disagree, tell the developer; the order test checks they stay equal.

**A customer says they paid but the order shows unpaid.**
- bKash Send Money: find the transaction ID in the bKash merchant app, then use **Record payment** on the order.
- Card or wallet through SSLCommerz: look the payment up in the SSLCommerz merchant panel. Payments are confirmed by SSLCommerz's own server message, so a payment that was really made appears within minutes. If it does not, record it by hand with the bank transaction ID and tell the developer.

**A bKash payment did not reach the order.** Look in the bKash merchant panel for the transaction. If it completed, use **Record payment** on the order with the bKash transaction ID. Tell the developer, because the shop asks bKash's server for every payment and should have recorded it itself.

**Google or Meta rejects products.** Open the feed address in a browser (`/feeds/google.xml` or `/feeds/meta.xml`) and check the book in question. The usual causes are a missing cover, a missing price, or a description in capital letters; fix the book in the admin. The feeds update within an hour.

**Customers are not getting sign-in codes.** See **Orders → Messages sent**: every SMS is listed with its status. `failed` means the SMS company refused it, so check your SMS balance. If the codes are being sent, the customer may have the wrong number or a full inbox. Someone who asks for more than 3 codes in 10 minutes must wait. One address can ask for at most 8 codes an hour.

**A staff member is locked out.** Five wrong passwords lock an account for 15 minutes. Wait, or use **Forgot password** on the sign-in page. That needs the email settings (`SMTP_*`) in `.env`; without them the reset email only goes to the server log.

**You suspect a break-in** (staff you do not recognise, orders changed by someone unknown):
1. In **Settings → Staff**, remove any account you do not recognise and change the Owner's password.
2. Change `PAYLOAD_SECRET` in `.env` and restart. This signs everyone out, staff and customers alike.
3. Take a backup immediately (it is evidence), then call the developer.

## Restoring a backup

Practise this on a spare database each month, so it is routine on a bad day.

```bash
# Practice: restore into a throwaway database and compare
createdb afterword_restore_test
DATABASE_URL=postgres://.../afterword_restore_test MEDIA_DIR=/tmp/media-test \
  sh scripts/restore.sh backups/afterword-YYYYMMDD-HHMM.dump --yes
psql afterword_restore_test -c "select count(*) from editions"   # compare with the live shop
dropdb afterword_restore_test
```

For real: stop the shop (`sudo systemctl stop afterword`), then run `sh scripts/restore.sh backups/<file>.dump` and type RESTORE. Start the shop and run `pnpm search:reindex`. Any orders placed after the backup are lost. Check the SSLCommerz and courier panels for them.

On 16 Nov 2026 this was tested locally: backup, then restore into an empty database. Books, orders, staff, the stock ledger and all 204 images came back identically.

## Launch checklist

**Accounts and settings**
- [ ] SSLCommerz live store, tested end to end on staging with the sandbox first. Done when one real payment and one refund have gone through
- [ ] SMS provider chosen, sender name approved, and connected in the code. Done when you have received a sign-in code on your own phone
- [ ] Pathao and/or Steadfast merchant accounts. One real parcel booked, delivered and its cash paid out to you
- [ ] bKash Tokenized Checkout tested in the sandbox, then live credentials set (or a bKash number in **Settings → Shop settings** for Send Money until then)
- [ ] Reward point rules confirmed in Shop settings
- [ ] Google Merchant Center and Meta catalogue reading the feeds, with no rejected books
- [ ] Delivery fees, free-delivery threshold, advance % and cash-on-delivery ceiling confirmed in Shop settings
- [ ] Lark Mail SMTP set in `.env`, with SPF/DKIM records in Cloudflare. Done when a staff password-reset email arrives
- [ ] Every staff member has their own account with only the roles they need

**Content**
- [ ] Full catalogue imported; every published book has a price and a cover
- [ ] Sample content replaced: the "Sample note" bookseller notes, the "Sample article" pieces, and author biographies
- [ ] About, Help, delivery and returns pages written; the returns policy agreed
- [ ] Home page features, collections and menu arranged

**Technical**
- [ ] Database migrations created and applied (see production.md, section 2)
- [ ] Hostinger KVM 2 set up as in production.md; the shop restarts on its own after a reboot (test it with `sudo reboot`)
- [ ] `node scripts/check-access.mjs https://your-domain` passes
- [ ] Daily backup running, off-site copy arriving, and one restore tested
- [ ] Uptime alert reaching your phone
- [ ] Cloudflare in front, with SSL set to Full (strict)
- [ ] `ALLOW_INDEXING=true` on the live server only; then submit `https://your-domain/robots.txt`'s sitemaps in Google Search Console

## Soft launch

1. **Week 1, friends and family.** Leave `ALLOW_INDEXING=false` and share the link privately with 20–50 people. Ask each to place a real order, some cash on delivery and some with an advance. Watch every order through to delivery.
2. **Fix what they find.** Read **Searches with no results** and the book requests daily; they show what people expected to find.
3. **Week 2–3, open quietly.** Set `ALLOW_INDEXING=true`, submit the sitemap to Google, and post on your own Facebook page. Keep an eye on courier payouts against **Reports → Money still to come in**.
4. **Then announce.**
