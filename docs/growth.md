# Growth features (phase 5)

What each feature does, where it lives in the admin, and what has to happen before it works on the live shop. Gift cards and a student discount were left out by decision on 16 Nov 2026: student status cannot be checked reliably in Bangladesh.

| Feature | Works on this computer | Needs before going live |
|---|---|---|
| Reviews | Yes | Nothing |
| Reward points | Yes | Confirm the rules in Shop settings |
| Shopping feeds | Yes | Google Merchant Center and Meta Commerce Manager accounts |
| Direct bKash | Code written, **not tested** | bKash merchant account with Tokenized Checkout; sandbox test |
| Newsletter | Yes (sign-up, unsubscribe, export) | Lark Mail SMTP for the welcome email; an email service to send the letters |

---

## Reviews

- **Who can review:** only a customer whose order with that book has been **delivered**, and only once per book. Every review is marked "bought from us". There are no anonymous reviews, so fake ones cannot be posted.
- **Where customers write them:** on the book page (under *Readers' reviews*), and from **Review your books** on their account page.
- **Moderation:** nothing appears until a person publishes it.
  - New reviews show on **Today's desk** as *reviews to check*, and under **Content → Reviews**.
  - Set **Published** or **Not published**; you can add a **Reply from the shop**.
  - Publish honest bad reviews too. Readers trust a shop whose reviews are not all five stars.
- **What changes when a review is published:** the book shows its average rating and count beside the author's name. The rating is also given to Google in the page's structured data, so it can appear in search results.
- **Privacy:** the public sees only the name the reviewer chose (for example "Nusrat K."), never their phone number or order.

## Reward points

- **How it works:** one point is worth **৳1**.
  - Customers earn points when an order is **delivered**, so refused cash-on-delivery parcels earn nothing. Points are earned on what they paid for books; delivery and gift wrap don't count.
  - They spend points at checkout by ticking **Use my points**. Points come off the books only, never delivery. Free delivery is judged *before* points, so using points never costs a customer free delivery.
  - If an order is cancelled or returned, the points spent on it go back.
- **Settings:** **Settings → Shop settings → Reward points**.
  - Switched on.
  - Earn 1 point per ৳100 (that is 1% back).
  - Spend from 100 points.
  - Points pay at most 20% of the books.

  These are my placeholders; set your own. A 1–2% return is usual for bookshops, because margins on imported books are thin.
- **Where to see them:**
  - The customer's page in the admin shows their balance.
  - **Orders → Reward points** lists every entry.
  - Customers see their balance and history on their account page.
- **Giving points by hand** (an apology, a competition prize): add an entry under **Orders → Reward points**. Use a positive number to give and a negative one to take away. Entries can't be edited; correct a mistake with a second entry.
- **Phone orders:** tick **Use the customer's reward points** on the order.
- **Safety:** the balance is the total of the entries, like stock. Points are taken off in the same step that saves the order, so two orders placed at the same moment cannot spend the same points. The order check tests this.

## Shopping feeds (Google and Facebook/Instagram)

Two addresses list every published book with a price and a cover. Each entry has its availability (in stock, pre-order, or *available for order* for On Request books), price, sale price, ISBN, publisher and cover:

- Google: `https://your-domain.com/feeds/google.xml`
- Meta (Facebook and Instagram Shops): `https://your-domain.com/feeds/meta.xml`

The feeds update themselves; services re-read them about once an hour. Covers are sent as JPEGs (`/feeds/cover/<isbn>.jpg`), because Meta does not reliably accept the WebP files the shop stores.

**Setting up Google:**
1. Create a Google Merchant Center account for the business, then verify and claim the website.
2. Add a product source with **Add products from a file → Enter a link to your file**, give it the Google feed address, and set it to fetch daily.
3. Set up shipping: Bangladesh, with your delivery fees from Shop settings, and the return policy.

**Setting up Meta:**
1. In Meta Commerce Manager, create a catalogue for the AFTERWORD Facebook page.
2. Add items with **Data feed → Scheduled feed**, give it the Meta feed address, and set it to fetch hourly or daily.
3. Connect the catalogue to the page's shop and to Instagram Shopping.

Both services review the shop before listing it. Have the About, delivery and returns pages written first.

## Direct bKash

Customers pay advances and full payments in the bKash app, through bKash's own **Tokenized Checkout**, without going through SSLCommerz. The fees are usually lower and the payment is the one most customers know.

- **How it works:** at checkout the customer chooses **bKash** and is taken to bKash's page to approve with their PIN. They then come back to their order page.
- **How payments are recorded:** the shop asks bKash's server whether the payment completed, and records it with the bKash transaction ID. Only the amount bKash confirms is recorded, never what the browser says, and a payment can never be recorded twice.
- **The order of payment choices:** bKash first, then *Card or other wallet* (SSLCommerz) if that is connected. *bKash Send Money* (the number in Shop settings, checked by hand) is offered only while online bKash isn't connected.
- **Refunds** are made from the bKash merchant panel for now. Record them in the order's staff notes.

**To switch it on:**
1. Apply to bKash for a merchant account with **Tokenized Checkout** (the PGW product). They send sandbox credentials first: app key, app secret, username and password.
2. Put them in `.env` as `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME` and `BKASH_PASSWORD`, and leave `BKASH_LIVE` unset (sandbox).
3. **Test on this computer or on staging:** place an order with an advance, pay with bKash's test wallet, and check the order shows the payment. Then try a failed and a cancelled payment.
4. When bKash approves the live account, change to the live credentials and set `BKASH_LIVE=true`.

**Not yet tested:** the code follows bKash's published API (v1.2.0-beta) but has never run against bKash, because that needs merchant sandbox credentials. Expect a little fixing during step 3.

## Newsletter

- **Sign-up:** a form in the footer of every page, and a tick box at checkout ("Send me the AFTERWORD newsletter"). Nobody is added without asking.
- **Welcome email:** each new subscriber gets a short welcome with an unsubscribe link. It needs the Lark Mail SMTP settings; until then the email is written to the server log.
- **Unsubscribing:** one click, no sign-in (`/newsletter/unsubscribe?t=…`).
- **The list:** **Content → Newsletter subscribers**. Managers can **download everyone subscribed** as a CSV (the link is above the list) and import it into Brevo, Mailchimp or a similar service to send the letters. People who unsubscribe are left out of the download, so download a fresh copy before each send.
- **Why the letters are not sent from the shop itself:** sending to hundreds of people from an ordinary mailbox (including Lark) gets the shop's email marked as spam. A newsletter service handles that, and also handles unsubscribes from its own emails. Mark those people as *Unsubscribed* here as well.
- **Sign-up without confirmation:** subscribers are added straight away, without clicking a link to confirm. If fake sign-ups become a problem, turn on double opt-in in your email service when importing.
