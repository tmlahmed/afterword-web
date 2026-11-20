# Putting AFTERWORD online (Hostinger KVM 2)

The plan: one **Hostinger KVM 2** server runs the whole shop, with free Cloudflare in front of it and free off-site backups.

**Status:** nothing here has been done yet. The shop is still being refined locally. When it is ready, work through this guide from top to bottom.

---

## 1. What you need

| What | Why | Cost | Status |
|---|---|---|---|
| **Hostinger KVM 2**, Ubuntu 24.04, location in Asia | Runs everything: shop, admin, database, search, images | about US$211 for 24 months on sale (about $8.80/month); renewal is higher | |
| **Domain name** | The shop's address | `.com` about US$10–15/year; `.com.bd` more, through BTCL or a reseller | |
| **Cloudflare**, free plan | DNS, HTTPS, attack protection, caching images | free | |
| **SMS provider** (Bangladeshi) | **Required.** Customers sign in with an SMS code and get order updates by SMS | per message, plus an approved sender name | Not yet connected in the code. See section 9 |
| **SSLCommerz** merchant account | Card, bKash and Nagad payments online | % per payment; usually needs a trade licence and a business bank account | Code ready, untested; needs sandbox credentials |
| **bKash merchant account with Tokenized Checkout (PGW)** | Customers pay in the bKash app; lower fees than bKash through SSLCommerz | % per payment; apply through bKash, which asks for a trade licence | Code ready, untested; needs bKash's sandbox credentials. See [growth.md](growth.md) |
| **bKash** personal or merchant number | Send Money advances checked by hand, until online bKash is connected | free | Enter in Settings → Shop settings |
| **Google Merchant Center** and **Meta Commerce Manager** | Books in Google Shopping and in Facebook and Instagram Shops | free to list | Feeds ready at `/feeds/google.xml` and `/feeds/meta.xml` |
| **Brevo**, **Mailchimp** or similar | Sending the newsletter to subscribers | free tiers to a few hundred or thousand contacts | Download the list from the admin and import it |
| **Pathao** merchant account (Steadfast optional) | Deliveries and cash-on-delivery collection | per parcel | Pathao connected: staff book pickups from the order page, and statuses update by themselves. Needs your live API credentials (section 9a). Other couriers: tracking numbers by hand |
| **Lark Suite** mail | Staff password-reset emails from the shop | free for a few users | Needs Lark's SMTP settings (section 7) |
| **Backblaze B2** or **Cloudflare R2** | Off-site copy of the daily backup | free at this size | |
| **UptimeRobot** or **Better Stack** | Alerts to your phone if the shop goes down | free | |
| Trade licence; Digital Business ID (DBID) for e-commerce | Usually asked for by SSLCommerz and the couriers | government fees | |

You do **not** need separate hosting for the database, the search engine or images. They all run on the KVM 2, with room left for a staging copy.

### Why KVM 2

KVM 2 has 2 vCPU, 8 GB RAM and 100 GB NVMe disk. The shop uses roughly 1.5–2.5 GB of memory when running: the application, PostgreSQL, Meilisearch and Caddy. Building a new version needs about 2–3 GB more for a few minutes. KVM 2 handles all of that, plus imports of thousands of books and image resizing, without the shop slowing down. Covers take about 30 KB per book, so 10,000 books need about 300 MB.

---

## 2. Before going live: still to do in the code

These are deliberately left until the shop is finished locally.

- [ ] **Database migrations.** Locally, the database updates its own structure automatically; a live server must not. Once the data model is final, create the first migration (`pnpm payload migrate:create initial`) and commit it. The server applies it with `pnpm payload migrate` on every deploy.
- [ ] **Connect the SMS provider** you choose (section 9).
- [ ] **Deployment helpers:** a server setup script, the systemd service file and the Caddy file below, committed to `deploy/`.
- [ ] **Tidy the leftovers.** The starter template's `Dockerfile` and `docker-compose.yml` are not used by this plan; remove them, or update them if you later want Docker.

---

## 3. Buying the server (Hostinger panel)

1. Buy **KVM 2**. The 24-month term keeps the low price longest. Note the refund window on the order page; Hostinger has usually offered 30 days.
2. **Location:** **Singapore** if offered, otherwise **Malaysia** or **India**. Never Europe or the US: pages reach Dhaka in about 50–80 ms from these locations, against 150–250 ms from the West.
3. **Operating system:** **Ubuntu 24.04 LTS, plain.** Do not choose a template with a control panel (CloudPanel, cPanel, Coolify and so on); the shop does not need one, and it would use memory.
4. **Access:** add your **SSH key** (Hostinger panel → VPS → Settings → SSH keys) and set a long root password as a fallback.
5. In the panel:
   - Note the server's **IPv4 address**.
   - Turn on Hostinger's **weekly backups** if they are included. They are an extra safety net, not a replacement for the daily backups in section 8.
   - Leave Hostinger's firewall off. The server's own firewall is set up below, and two firewalls are easy to misconfigure.
6. You can use the **browser terminal** in the Hostinger panel. For everything below, a normal SSH session from your computer is easier (`ssh root@SERVER-IP`).

---

## 4. Setting up the server (about two hours, once)

Run these as root over SSH. Lines starting with `#` explain.

**4.1 Updates, safety, swap space**
```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades git curl build-essential postgresql-client
dpkg-reconfigure -plow unattended-upgrades          # automatic security updates
timedatectl set-timezone Asia/Dhaka                  # cron times and logs in Dhaka time

# Swap: a safety margin for builds
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall: SSH and web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

**4.2 A user for the shop.** Never run the shop as root.
```bash
adduser --disabled-password --gecos "" afterword
mkdir -p /home/afterword/.ssh && cp ~/.ssh/authorized_keys /home/afterword/.ssh/
chown -R afterword:afterword /home/afterword/.ssh
```
Then turn off password logins: in `/etc/ssh/sshd_config` set `PasswordAuthentication no`, and run `systemctl restart ssh`. **Test that key login works in a second window before closing the first.**

**4.3 PostgreSQL 16**
```bash
apt install -y postgresql
sudo -u postgres psql -c "CREATE USER afterword WITH PASSWORD 'LONG-RANDOM-PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE afterword OWNER afterword;"
```
PostgreSQL only listens on the server itself by default. Keep it that way.

**4.4 Meilisearch 1.56** (search)
```bash
curl -L https://install.meilisearch.com | sh && mv meilisearch /usr/local/bin/
useradd --system --home /var/lib/meilisearch meilisearch && mkdir -p /var/lib/meilisearch && chown meilisearch /var/lib/meilisearch
```
Create `/etc/systemd/system/meilisearch.service`:
```ini
[Unit]
Description=Meilisearch
After=network.target

[Service]
User=meilisearch
ExecStart=/usr/local/bin/meilisearch --db-path /var/lib/meilisearch/data --http-addr 127.0.0.1:7700 --env production --master-key LONG-RANDOM-KEY --no-analytics
Restart=always

[Install]
WantedBy=multi-user.target
```
Then run `systemctl enable --now meilisearch`.

**4.5 Node.js 24 and pnpm** (as the shop user)
```bash
su - afterword
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc && nvm install 24.22.3 && corepack enable
```

**4.6 Caddy** (HTTPS and passing visitors to the shop), as root:
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```
Replace `/etc/caddy/Caddyfile` with:
```
your-domain.com, www.your-domain.com {
    encode zstd gzip
    request_body {
        max_size 12MB
    }
    reverse_proxy 127.0.0.1:3000
}
```
Then run `systemctl reload caddy`. Caddy fetches and renews the HTTPS certificate on its own.

---

## 5. Putting the shop on the server

As the `afterword` user:
```bash
git clone YOUR-REPOSITORY-URL afterword-web && cd afterword-web
nano .env       # contents below
pnpm install --frozen-lockfile
pnpm payload migrate        # once migrations exist (section 2)
pnpm build
cp -r public .next/standalone/ 2>/dev/null; cp -r .next/static .next/standalone/.next/
```

**`.env` on the server:**
```
DATABASE_URL=postgres://afterword:LONG-RANDOM-PASSWORD@127.0.0.1:5432/afterword
PAYLOAD_SECRET=           # openssl rand -hex 32  (the shop refuses to start with a weak one)
MEILI_URL=http://127.0.0.1:7700
MEILI_KEY=                # the Meilisearch master key from 4.4
NEXT_PUBLIC_SITE_URL=https://your-domain.com
MEDIA_DIR=/home/afterword/afterword-web/media
ALLOW_INDEXING=false      # true only on launch day; keeps search engines out until then

# Lark mail (section 7)
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=shop@your-domain.com

# When the accounts exist
# SSLCZ_STORE_ID=
# SSLCZ_STORE_PASSWORD=
# SSLCZ_LIVE=true
# BKASH_APP_KEY=  BKASH_APP_SECRET=  BKASH_USERNAME=  BKASH_PASSWORD=  BKASH_LIVE=true
# PATHAO_CLIENT_ID=  PATHAO_CLIENT_SECRET=  PATHAO_USERNAME=  PATHAO_PASSWORD=  PATHAO_STORE_ID=  PATHAO_LIVE=true
# PATHAO_WEBHOOK_SECRET=  PATHAO_WEBHOOK_REPLY=
# RCLONE_REMOTE=b2:afterword-backups
```
Lock the file down with `chmod 600 .env`.

**Keep it running.** As root, create `/etc/systemd/system/afterword.service`:
```ini
[Unit]
Description=AFTERWORD shop
After=network.target postgresql.service meilisearch.service

[Service]
User=afterword
WorkingDirectory=/home/afterword/afterword-web
EnvironmentFile=/home/afterword/afterword-web/.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/home/afterword/.nvm/versions/node/v24.22.3/bin/node .next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Then run `systemctl enable --now afterword`. Visit the site, create the Owner account at `/admin`, and fill in **Settings → Shop settings** and **Pricing rules**.

---

## 6. Cloudflare

1. Add the domain to Cloudflare (free plan) and change the nameservers at your domain registrar to Cloudflare's.
2. DNS: add an `A` record for `@` and for `www`, both pointing to the server's IP, with the **orange cloud on** (proxied).
3. SSL/TLS: set **Full (strict)**.
4. Lock the server to Cloudflare, so nobody can bypass it. Allow ports 80 and 443 only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), then remove the general rules:
   ```bash
   for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 80,443 proto tcp; done
   ufw delete allow 80 && ufw delete allow 443
   ```
   The shop reads each visitor's address from Cloudflare's `CF-Connecting-IP` header, for its rate limits. That is only trustworthy when all traffic really comes through Cloudflare.
5. Caching: leave the defaults. Cloudflare caches images and scripts but not pages, which is right, because prices and stock must be live.

---

## 7. Email through Lark Suite

The shop sends very little email; customers get SMS, not email. Email is used only for **staff password resets**.

1. In Lark Mail, create a mailbox for the shop, for example `shop@your-domain.com`, or use your own.
2. Find Lark Mail's **SMTP settings for third-party apps**: server, port and an app password. Lark's admin console may need third-party mail clients enabled first. Put them in `.env` as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`.
3. Test: on the admin sign-in page, press **Forgot password** for a staff account and check the email arrives.
4. Add the **SPF and DKIM** DNS records Lark gives you in Cloudflare, so the shop's emails do not land in spam.

If your Lark plan does not allow SMTP sending, use the free tier of Brevo or Resend instead. Only the five `SMTP_*`/`EMAIL_FROM` values change.

---

## 8. Backups and alerts

**Daily backup.** As the `afterword` user, run `crontab -e` and add:
```
15 3 * * *  cd /home/afterword/afterword-web && sh scripts/backup.sh >> backups/backup.log 2>&1
*/30 * * * *  cd /home/afterword/afterword-web && pnpm -s courier:sync >> backups/courier.log 2>&1
```
The backup keeps the newest 14 copies on the server. The second line asks Pathao about parcels every half hour (section 9a).

**Off-site copy.** Make a free Backblaze B2 (or Cloudflare R2) bucket, install rclone (`curl https://rclone.org/install.sh | sudo bash`), run `rclone config` to add it as a remote called `b2`, and set `RCLONE_REMOTE=b2:afterword-backups` in `.env`. Every backup is then copied off the server as well.

**Monthly:** test a restore into a spare database ([runbook.md](runbook.md) has the steps).

**Alerts.** In UptimeRobot or Better Stack, watch `https://your-domain.com/api/health` every 5 minutes, with alerts to your phone. A healthy shop answers `{"ok":true,"database":true,"search":true}`.

---

## 9. Connecting the SMS provider (code change)

On the live site, customers can only sign in with an SMS code. Choose a Bangladeshi bulk SMS provider (SSL Wireless, Alpha SMS, BulkSMSBD and others have simple APIs), open an account, and apply for a **sender name** (masking) early, since approval can take a while. Then the developer adds that provider in `src/lib/notify.ts` and puts its API key in `.env`. Until then, every message is only logged under Orders → Messages sent.

---

## 9a. Pathao: switching to live

The shop already talks to Pathao. Locally it uses Pathao's **test server** (no rider ever comes). To go live:

1. In the Pathao merchant panel, open **Developer's API** and press **Generate Credentials**. You get a *client ID* and *client secret*. Your *username* and *password* are your merchant panel login.
2. Under **Stores**, check your pickup store is active, and note its **store ID** (or leave `PATHAO_STORE_ID` empty to use the default store).
3. Put them in `.env` on the server with `PATHAO_LIVE=true`, then restart the shop (`sudo systemctl restart afterword`).
4. Book one real parcel to yourself from the order page to check it appears in the Pathao panel.
5. **Webhook (optional but best):** in the Pathao panel's webhook settings, set the address to `https://your-domain.com/courier/pathao`. Choose a secret and put it in `PATHAO_WEBHOOK_SECRET`. If Pathao shows an *integration secret* that your webhook must return, put that in `PATHAO_WEBHOOK_REPLY`. Restart the shop, then add the webhook in the panel. Statuses then update within seconds; without it, the half-hourly `courier:sync` still catches everything.

The webhook never trusts what it is told: it only names a parcel, and the shop reads that parcel's status back from Pathao itself.

If Pathao gives you a different live API address with your credentials, set it as `PATHAO_BASE_URL`.

---

## 10. Final checks before opening

```bash
node scripts/check-access.mjs https://your-domain.com     # from your own computer; must say "All access checks passed"
curl https://your-domain.com/api/health
```
Then work through the **launch checklist** and **soft launch** plan in [runbook.md](runbook.md).

## Deploying an update later

Run as the `afterword` user, in a quiet hour:
```bash
cd ~/afterword-web && sh scripts/backup.sh
git pull && pnpm install --frozen-lockfile && pnpm payload migrate && pnpm build
cp -r public .next/standalone/ 2>/dev/null; cp -r .next/static .next/standalone/.next/
sudo systemctl restart afterword
```

## A staging copy (optional, same server)

KVM 2 has room for a second copy at `staging.your-domain.com`:
- its own database (`afterword_staging`) and folder;
- port 3001, with a second systemd service and a second Caddy block;
- `ALLOW_INDEXING=false` and SSLCommerz **sandbox** credentials.

Try changes there first.

## Sources (checked 16 Nov 2026)

- [Hostinger VPS hosting](https://www.hostinger.com/vps-hosting.md)
- [Hostinger VPS pricing and renewal costs (HostAdvice)](https://my.hostadvice.com/hosting-company/hostinger-reviews/vps-pricing/)
- [Hostinger VPS pricing (Valebyte)](https://valebyte.com/en/providers/hostinger/)
- [Hostinger KVM 1 benchmarks (VPSBenchmarks)](https://www.vpsbenchmarks.com/hosters/hostinger/plans/kvm-1)
