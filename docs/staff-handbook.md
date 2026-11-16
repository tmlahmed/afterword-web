# AFTERWORD staff handbook

How to run the shop day to day. Everything happens in the admin at `/admin`. Sign in with your own account and never share it. What you can see depends on your role:

| Role | Can work on |
|---|---|
| Owner | Everything, including staff accounts and settings |
| Manager | Everything except staff accounts; sees Reports |
| Catalogue editor | Books, authors, prices, collections, imports |
| Order desk | Orders, customers, book requests, promotions (view) |
| Warehouse | Stock, receiving deliveries, packing |
| Writer | Marginalia articles, bookseller notes, pages |

Five wrong passwords lock your account for 15 minutes.

---

## 1. The morning: Today's desk

The first admin screen shows what needs doing. Click any tile to see the list behind it.

- **Orders to confirm**: new website orders. Each one needs a person to look at it (below).
- **Orders to pack**: confirmed, books set aside, ready for a parcel.
- **With couriers**: out for delivery. Mark them delivered or returned.
- **Waiting for stock**: paid an advance; the book is on its way to us. These move to "To pack" on their own when the delivery is received.
- **Book requests to quote**: customers asking for books we do not list.
- **Reviews to check**: customers' reviews waiting to be published (section 5).
- **Books down to the last copy**: consider reordering.

## 2. Orders (order desk)

An order changes only through the buttons at the top of its page. Never type over its fields. Every step is recorded in the order's history with your name, and the customer gets a text message at each step.

**Confirming a new order.** Open it and check that the name, phone and address make sense. For a large cash-on-delivery order, or anything that looks odd, call the customer first. Then press **Confirm order**.
- If the order has copies in stock, it moves to **To pack**.
- If it needs an advance (pre-orders, On Request books, large cash orders), the button waits until the advance is recorded.
- If the books are not here yet, it moves to **Waiting for stock**.

**Recording a payment.** Use **Record payment** with the amount, the method (bKash, Nagad, card, bank transfer, cash) and the transaction ID.
- For a bKash Send Money advance, the customer typed their transaction ID at checkout. **Find that ID in the bKash merchant app before recording it.** The order shows "Payment to verify" until you do.
- Card and wallet payments through SSLCommerz record themselves.

**Packing.** Press **Print packing slip ↗**. The slip has a pick list and the address. Gift orders print without prices and include the gift note. Pack the books, then choose the courier, type the **tracking number**, and press **Hand to courier**. The customer gets the tracking number by text.

**Delivered.** When the courier confirms delivery, press **Mark delivered**. For cash on delivery this also records the cash the courier collected, so match it against the courier's payout.

**Came back undelivered.** Press **Came back undelivered** when the parcel is returned. The books go back into stock automatically.

**Cancelling.** Press **Cancel order** with a short reason. Any copies set aside go back into stock. An order that is already with a courier cannot be cancelled; wait for it to come back and mark it returned. If the customer paid anything, refund it through bKash or SSLCommerz, then note it on the order.

**Phone, Facebook and WhatsApp orders.** Go to Orders → **Create new**. Fill in the customer, the address and the books with their quantities, choose how they will pay, and save. Prices, delivery and stock are worked out when you save. Staff cash orders are confirmed straight away.

**Book requests (On Request).** Customers ask for books through the "Request a book" form, and requests appear under Orders → Book requests. To answer one:
1. Add the book with **Add a book by ISBN** (see section 3), set its price and lead time, and publish it.
2. In the request, link the book, write a reply, and set the status to **Quoted**. The customer sees the reply and an "Order for ৳…" button on their account page.
3. If you cannot get it, set **Cannot supply** with a kind reply.

## 3. Catalogue (catalogue editors)

**Adding one book.** In Catalogue → Books, type or scan the ISBN into **Add a book by ISBN**. The title, author, publisher, description and cover are filled in from the book databases, and the cover is copied into our own store. The book is saved as a **draft**. Check it, then:
- set the **list price and currency** (the price on the book), so the selling price is worked out from Settings → Pricing rules, or type a **Manual price** in taka;
- choose its **subjects**;
- set **Sourcing**: *Standard* (shows "In stock" when we have copies, otherwise "On Request"), *Pre-order* (add the date it reaches Dhaka), or *Out of print*;
- change the status to **Published**.

**Adding many books at once.** In Catalogue → Books, use **Import books from a spreadsheet**.
- Press **Download a template** to see the columns. Only `isbn` is required.
- Save your sheet as **CSV** and choose it.
- The import runs in the background at about one book a second, and you can close the page. Rows that need attention (ISBN not found, no price, unknown subject) are listed by row number under Catalogue → Catalogue imports.
- Running the same file again is safe: books already in the shop are updated, not duplicated. Put `yes` in the `publish` column for books that are ready to sell.
- The `stock` column sets the copies on hand. Leave it empty if you do not want to change stock.

**Covers.** To replace a cover, upload a new image in the book's **Cover** field. The shop uses it at once.

**Bookseller notes ("The Afterword").** Content → Bookseller notes: two to four sentences on why this book, signed with your name. They appear on the book's page.

**Collections.** Content → Collections: hand-picked lists such as monthly picks, prize lists and gift guides. Drag the books into order and write a sentence or two of introduction.

**Home page and menu.** Content → Home page arranges the featured book, the shelves and the pull-quote. Content → Main menu arranges the menu across the top.

**Reward points.** Customers earn points on delivered orders and spend them at checkout (1 point = ৳1). On a phone order, tick **Use the customer's reward points** to spend them. To give or take points by hand, add an entry under **Orders → Reward points** with a note saying why. The rules are in Settings → Shop settings → Reward points.

**Promotions.** Orders → Promotions: codes for a percentage off, a fixed amount off, or free delivery, with an optional minimum spend. Customers type the code in their bag.

## 4. Stock (warehouse)

Stock is a ledger: the copies on hand are the total of every movement. **Nobody types a stock number directly**, and movements cannot be edited or deleted. To fix a mistake, add another movement.

- **Receiving a supplier delivery.** Open the purchase order under Stock and purchasing → Purchase orders and press **Receive this delivery into stock**. Copies are added, orders waiting for those books move to **To pack**, and those customers get a message.
- **Counting stock.** If the shelf and the shop disagree, add a stock movement with the reason **Stock count correction**, the difference (for example `-1` or `2`), and a note.
- **Damaged copies.** Add a movement with the reason **Damaged or lost** and a negative number.
- Sales, cancellations and returns record their own movements; you never enter those.

## 5. Writers and reviews

**Reviews.** Customers can review a book once their order with it has been delivered. Open **Content → Reviews** (or the desk tile) and read each one:
- Publish it if it is about the book. A critical review is fine, and it helps readers trust the others.
- Choose **Not published** for abuse, advertising, personal details, or spoilers in the title.
- Add a **Reply from the shop** if it helps, for example to answer a question about the edition.

**Newsletter.** **Content → Newsletter subscribers** lists everyone who asked for it. Managers download the list as a CSV (the link is at the top) before each send and import it into the newsletter service. See [growth.md](growth.md).


- **Marginalia** (Content → Articles): essays, interviews and reading lists. Add books to an article with the shelf and note blocks.
- **Pages** (Content → Pages): About, Help, delivery and returns.
- Keep everything as **Draft** until it is ready, then publish.

## 6. Reports (managers)

**Reports** sits in the admin's side menu. Choose a period at the top. Every table has a **Download as a spreadsheet** link.
- **Sales**: orders, books sold, average order, delivery charged, day by day.
- **Money still to come in**: cash with each courier, advances to check, and advances held for books not yet sent. Use it to check courier payouts every week.
- **Best sellers**, **By subject** and **By district**.
- **Stock**: copies, value at selling price, and estimated cost (from list prices and your exchange rates).
- **Selling fast — consider reordering** and **Not selling** (no sale in 90 days).
- **What customers asked for**: book requests, and words people searched for that found nothing. This is the best guide to what to bring in next.

## 7. Settings (owner and managers)

- **Settings → Shop settings**: the announcement strip; delivery fees and times; free-delivery threshold; gift-wrap price; advance percentage; cash-on-delivery ceiling; the bKash number shown for manual payments; and the wording of every text message to customers.
- **Settings → Pricing rules**: the taka you actually pay for each currency, your margin and the rounding. Changing these does not re-price existing books until each is saved again.
- **Settings → Staff**: the owner adds accounts and gives each person only the roles they need. When someone leaves, delete their account the same day.

## Good habits

- Confirm new orders within a few hours. Customers are told when to expect a call.
- Never ask a customer for their bKash PIN or a card number. Nobody from the shop ever needs them.
- Write a note on an order whenever something unusual happens. The next person will thank you.
- If something looks wrong (a price, a stock figure, a payment), stop and ask before "fixing" it.
