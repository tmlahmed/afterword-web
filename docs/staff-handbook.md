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

## 1. The morning: the Dashboard

The first admin screen. Reach it from any page with **Dashboard** at the top of the side menu.

**Finding your way.** The side menu is grouped by how often things are used: **Sell** (orders, requests, customers, promotions), **Catalogue**, **Stock**, **Website** and **Settings**. Rarely needed screens come last in their group. Click a group's name to fold it away; the menu also keeps its place when you scroll it and open another page. A red number beside **Orders**, **Book requests** or **Reviews** is how many are waiting. On laptops the menu stays open; the button at its top left hides it, and it stays hidden until you open it again. **View the shop** at the bottom opens the website.

**Needs attention** lists only what is waiting; click one to see the list behind it. When nothing is, it says *All clear*.

**Alerts.** The bell at the top right of every admin page lists what has just happened: new website orders (and advances to check), book requests, reviews to read, books arrived for waiting orders, and replacements to send. A red number shows how many are new to you; the browser tab shows it too, e.g. *(2) Dashboard*. Each person sees the alerts for their role. Open the bell and press **Turn on desktop alerts** to get a pop-up on your computer whenever one arrives, as long as the admin is open in a tab.

- **Orders to confirm**: new website orders. Each one needs a person to look at it (section 2).
- **Payments to check**: advances customers say they have sent by bKash, Bangla QR or bank.
- **To pack**: confirmed, books set aside, ready for a parcel.
- **Book requests**: customers asking for books we do not list.
- **Reviews to read**: customers' reviews waiting to be published (section 5).
- **With couriers**: out for delivery. Mark them delivered or returned.
- **Waiting for stock**: paid an advance; the book is on its way to us. These move to "To pack" on their own when the delivery is received.
- **Books on their last copy**: consider reordering.

Below that, owners and managers see **Sales** (today, the last 7 and 30 days against the period before, a chart of each day, cash with couriers and advances to check), then **Latest orders**, **Best sellers** and **Running low, reorder**. The full tables and spreadsheets are under **Reports**. Other roles see the parts their work covers.

## 2. Orders (order desk)

An order changes only through the buttons at the top of its page. Never type over its fields. Every step is recorded in the order's history with your name, and the customer gets a text message at each step.

**Confirming a new order.** Open it and check that the name, phone and address make sense. For a large cash-on-delivery order, or anything that looks odd, call the customer first. Then press **Confirm order**.

**Advances.** Only books we order in (On Request and pre-orders) need an advance: your advance percentage of *their* price. Books in stock are always cash on delivery. An order that needs an advance cannot be confirmed until the advance is recorded.

**Recording a payment.** Use **Record payment** with the amount, the method (bKash, Nagad, card, bank transfer, cash) and the transaction ID.
- For a bKash Send Money or Bangla QR advance, the order shows **the number or account the customer paid from**, and the **transaction ID** if they gave one (it is optional, because some bank apps make it hard to find). Find that payment in your bKash app by the sender, the amount and the time before recording it. A Bangla QR payment from Nagad, Rocket or a bank app also arrives in your bKash account.
- **Bangla QR:** in Settings → Shop settings, upload a screenshot of your Bangla QR (bKash app → My QR) under *Bangla QR picture* and save. Checkout then shows it, redrawn in black and white, for customers to scan from any payment app. Remove the picture to stop showing it.

**Orders in two parcels.** When an order has books in stock *and* books to order in, the customer chooses at checkout:
- *Send the books in stock now:* **Parcel 1** (in stock) is packed straight away. The courier collects the price of those books plus the delivery fee. **Parcel 2** (ordered in) waits; when its books are received it moves to "To pack" by itself and the customer gets a text. The courier collects the rest of those books' price **plus a second delivery fee**: each parcel is its own delivery. When the order qualifies for free delivery, both parcels are free.
- *Send everything together:* one parcel and one delivery fee, sent when every book is here.

Each parcel has its own **Packing slip**, **Hand to courier**, **Mark delivered** and **Came back undelivered** buttons on the order page. The slip shows what the courier collects for that parcel.

**Packing.** Press **Packing slip ↗** for the parcel. It has a pick list and the address; gift orders print without prices and include the gift note. Pack the books, then:
- **Pathao:** press **Book Pathao pickup**. The parcel is booked in Pathao with the customer's address, the weight and the amount to collect, and Pathao's consignment ID becomes the tracking number. Write the consignment ID on the parcel (or print Pathao's label from their panel). It can take up to a minute.
- **Any other courier:** choose it, type the **tracking number** and press **Hand to courier**.

Either way the customer gets the tracking number by text.

**Following Pathao parcels.** The order page shows what Pathao last said ("Pickup Requested", "In Transit"…). The shop asks Pathao every half hour, and at once when Pathao calls it. Press **Check with Pathao** to ask now.
- When Pathao says **Delivered**, the parcel is marked delivered and the cash recorded, by itself.
- When Pathao says **Return**, the parcel is marked returned and its books go back into stock.
- When Pathao **cancels the pickup**, the parcel goes back to "To pack" so you can book it again.
- A **partial delivery** or **exchange** is left for you: check it in the Pathao panel and finish the parcel by hand.

**Delivered.** For other couriers, press **Mark delivered** on the parcel when the courier confirms delivery. It records the cash the courier collected, so match it against the courier's payout (for Pathao, compare with Pathao's invoice; the order shows Pathao's charge for each parcel).

**Came back undelivered.** Press **Came back undelivered** on the parcel when it is returned. Its books go back into stock automatically.

**Courier did not take it.** If a parcel was marked with the courier but never left (booked by mistake, pickup missed), press **Courier did not take it**. It goes back to "To pack". Cancel the booking in the courier's own panel too.

**Cancelling.** Press **Cancel order** with a short reason. Any copies set aside go back into stock. A parcel already with a courier cannot be cancelled; wait for it to come back and mark it returned. If the first parcel has been delivered, the button reads **Cancel the rest** and cancels only the books not yet sent; the advance paid for them is owed back. Whatever the customer paid for books that will not be sent is shown on the order as **to pay back**, and under *Refunds to pay* on the Dashboard.

**Refunds.** Send the money back the way it came (bKash, Nagad, bank or card), within 10 days. Then, on the order, enter the amount, method and transaction ID and press **Record refund**. The amount owed goes to zero and the order shows what was refunded. Sales in Reports are counted after refunds.

**Books that come back after delivery** (damaged, a wrong copy, a changed mind). On the order, press **Books came back after delivery…**, choose the books and copies, then:
- whether the copies are **fine** (they go back on the shelf, into the delivery they came from) or **damaged** (written off as damaged);
- whether the customer gets a **refund** (the price they paid for those copies is filled in; change it if you also refund delivery) or a **replacement copy** (it comes off the shelf at once; book the courier for it yourself, and an alert reminds the warehouse).
A refund is then owed and recorded as above.

**Cash-on-delivery risk.** Some new orders are marked **Check first** or **High risk** in the order list and at the top of the order: the customer refused a parcel before (twice or more is high risk), their earlier orders were all cancelled, or it is their first order and the cash to collect is above the amount in Settings → Shop settings (৳3,000 to start). Call them before confirming; for high risk, consider asking for an advance. The order page also shows the customer's record: earlier orders, delivered, cancelled and refused.

**Phone, Facebook and WhatsApp orders.** Go to Orders → **Create new**. Fill in the customer, the address and the books with their quantities, choose how they will pay, and save. Prices, delivery and stock are worked out when you save. Staff cash orders are confirmed straight away.

**Book requests (On Request).** Customers ask for books through the "Request a book" form, and requests appear under Orders → Book requests. To answer one:
1. Add the book with **Add a book by ISBN** (see section 3), set its price and lead time, and publish it.
2. In the request, link the book, write a reply, and set the status to **Quoted**. The customer sees the reply and an "Order for ৳…" button on their account page.
3. If you cannot get it, set **Cannot supply** with a kind reply.

## 3. Catalogue (catalogue editors)

**Adding one book.** In Catalogue → Books, press **Create new**, then type or scan the ISBN into **Add a book by ISBN** at the top (Enter works, so a barcode scanner does it in one go). The title, author, publisher, description and cover are filled in from the book databases, and the cover is copied into our own store. The book is saved as a **draft**. Check it, then:
- set the **printed price and currency**, as printed on the book (for example 599 INR). The **listed price** in taka is worked out from Settings → Pricing rules: 599 × 2 = ৳1,198, rounded to ৳1,200;
- customers pay the listed price less the **discount**. Leave *Discount (%)* empty for the shop discount (15%), type another percentage for this book, or **0** to sell at the listed price. With a discount, customers see ~~৳1,200~~ ৳1,020 · 15% off, with a red "−15%" tag on the cover;
- for a particular figure instead, type a **Fixed price**, e.g. ৳899;
- the box under the fields shows what **customers see** and what **you make** on the next copy (its cost from the delivery it came in, and the margin). It turns red below your minimum margin (Pricing rules). It also lists the deliveries on the shelf, oldest first;
- choose its **subjects**;
- set **Sourcing**: *Standard* (shows "In stock" when we have copies, otherwise "On Request"), *Pre-order* (add the date it reaches Dhaka), or *Out of print*;
- change the status to **Published**.

**Adding many books at once.** In Catalogue → Books, press **Create new** and use **Import books from a spreadsheet** at the top.
- Press **Download a template** to see the columns. Only `isbn` is required.
- Save your sheet as **CSV** and choose it.
- The import runs in the background at about one book a second, and you can close the page. Rows that need attention (ISBN not found, no price, unknown subject) are listed by row number under Catalogue → Catalogue imports.
- Running the same file again is safe: books already in the shop are updated, not duplicated. Put `yes` in the `publish` column for books that are ready to sell.
- The `stock` column sets the copies on hand. Leave it empty if you do not want to change stock.

**Gifts and stationery** (bookmarks, notebooks, tote bags…). In Catalogue → Books, press **Create new** and choose **This is a: Gift or stationery** at the top. The book-only fields (ISBN, authors, publisher) disappear. Fill in:
- the **title** and **description** (what it is, its size and material), and the **main photo** under *Cover or main photo*, plus any **More photos**;
- **Type of item** (Bookmark, Notebook or journal, Tote bag…) and, if you like, your own **stock code**;
- the **subject**: one of the sections under *Gifts & Stationery* (Bookmarks, Notebooks & Journals, Tote Bags, Pens & Pencils, Cards & Wrapping, Gift Sets);
- the **printed price** in **BDT** (your own price for it), the size and weight. Gifts get no shop discount; type one in *Discount (%)* if you want it;
- **Published**, then receive the stock like any book.

Items are only sold from your own shelves: with none left they show **Sold out** and cannot be ordered (never "On Request").

**Covers.** To replace a cover, upload a new image in the book's **Cover** field. The shop uses it at once.

**Bookseller notes ("The Afterword").** Content → Bookseller notes: two to four sentences on why this book, signed with your name. They appear on the book's page. If a book has more than one note, choose the one to show: either in the book's own page under **The Afterword shown for this book** (it lists only that book's notes), or by ticking **Show this one as The Afterword** on the note. Both stay in step, and the book's other notes are unticked for you. With none ticked, the most recently edited note is shown.

**Collections.** Content → Collections: hand-picked lists such as monthly picks, prize lists and gift guides. Drag the books into order and write a sentence or two of introduction.

**Home page and menu.** Content → Home page arranges the featured book, the shelves and the pull-quote. Content → Main menu arranges the menu across the top.

**Reward points.** Customers earn points on delivered orders and spend them at checkout (1 point = ৳1). On a phone order, tick **Use the customer's reward points** to spend them. To give or take points by hand, add an entry under **Orders → Reward points** with a note saying why. The rules are in Settings → Shop settings → Reward points.

**Promo codes.** Sell → Promo codes: codes for a percentage off, a fixed amount off, or free delivery, with an optional minimum spend. Customers type the code in their bag.

**Group discounts.** Sell → Group discounts: a percentage off every book in chosen subjects (including their sub-subjects), publishers or collections, or picked one by one, for example "20% off Penguin Classics this week". Set a start and end, or leave them empty and untick **Active** to stop it. A book gets the bigger of its own discount and the group's; books with a fixed price are left alone. Prices change within a minute of saving, and within a quarter of an hour of the start and end times.

## 4. Stock (warehouse)

**To order.** Stock → **To order** lists the books customers are waiting for (On Request, pre-orders, or stock that ran out) that still have to be ordered, grouped by the book's supplier: how many copies are waiting, on their way on a purchase order, free on the shelf, and **to order**, with the orders behind each. Order them from the supplier yourself, then record the purchase order; they then move to *Already covered*. Below are books selling fast and running low. The Dashboard shows how many books are to order.

Stock is a ledger: the copies on hand are the total of every movement. **Nobody types a stock number directly**, and movements cannot be edited or deleted. To fix a mistake, add another movement.

- **Recording a purchase.** Stock → Purchase orders → Create new, one per shipment. Choose the supplier and the **currency** of their prices, and enter the **exchange rate you paid** (what one rupee or pound really cost, e.g. 1.42). For each book: the quantity, the **printed price** and the supplier's **discount %**; *Cost each* is worked out for you. Under **Shipment costs**, add everything else in taka: freight, customs duty and VAT, clearing agent, transport to Dhaka, bank charges. Save. Each line then shows its **landed cost**: what one copy really cost here, with its share of the shipment costs (shared by value, so dearer books carry more).
- **Receiving it.** When the books arrive, correct any quantities, save, and press **Receive this delivery into stock**. Each book becomes a **stock lot** (Stock → Stock lots, coded like *L-14*) at its landed cost. Copies are added, orders waiting for those books move to **To pack**, and those customers get a message.
- **Labelling.** Copies are sold oldest delivery first. If older copies of the same book with a **different printed price** are still on the shelf, the purchase order shows a **Labelling** note: write the lot code (e.g. *L-14*) in pencil inside the back cover of the new copies, and pack the unmarked ones first. Otherwise there is nothing to label: the ISBN barcode on the book is all you need.
- **Prices follow the shelf.** The shop's price is based on the printed price of the copies that go out next. When the older copies run out, the book is re-priced from the next delivery by itself (₹599 copies at ~~৳1,200~~ ৳1,020, then ₹699 copies at ~~৳1,400~~ ৳1,190).
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
- **Profit**: what customers paid for the books (after discounts, without delivery) less what those exact copies cost you, overall and by title.
- **Deliveries**: each purchase order with copies in, sold and left, their cost, and the profit on the copies sold so far.
- **Stock**: copies, value at selling price, and what they cost you (from each delivery's landed cost; copies from before costs were recorded are estimated, and a manager can correct a lot's cost under Stock → Stock lots).
- **Selling fast — consider reordering** and **Not selling** (no sale in 90 days).
- **What customers asked for**: book requests, and words people searched for that found nothing. This is the best guide to what to bring in next.

## 7. Settings (owner and managers)

- **Settings → Shop settings**: the announcement strip; delivery fees and times; free-delivery threshold; gift-wrap price; advance percentage; cash-on-delivery ceiling; the bKash number and Bangla QR shown for manual payments; and the wording of every text message to customers.
- **Settings → Pricing rules**: for each currency, the **taka per unit** that turns a printed price into the listed price (2 for rupees, the market convention) and the **exchange rate you pay** (for costs); the **shop discount** (15%); the margin and rounding; your **usual supplier discount** (only for estimating old stock); and the **minimum margin** a book page warns below. Saving re-prices every book within a minute.
- **Settings → Staff**: the owner adds accounts and gives each person only the roles they need. When someone leaves, delete their account the same day.

## Good habits

- Confirm new orders within a few hours. Customers are told when to expect a call.
- Never ask a customer for their bKash PIN or a card number. Nobody from the shop ever needs them.
- Write a note on an order whenever something unusual happens. The next person will thank you.
- If something looks wrong (a price, a stock figure, a payment), stop and ask before "fixing" it.
