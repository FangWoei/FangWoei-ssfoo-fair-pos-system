# Fair till

A two-laptop point of sale for a four-day fair. React + Vite on the front,
Firebase (anonymous auth + Firestore) behind it. Both laptops see the same
products and the same sales in real time.

- **Windows laptop** — cash and Touch 'n Go, prints receipts, opens the drawer.
- **MacBook** — Touch 'n Go and card. No cash, no drawer.

Each laptop picks its identity once on first load and never shows a payment
method it can't actually take.

---

## Setup, about 20 minutes

### 1. Firebase

1. Create a project at https://console.firebase.google.com.
2. **Build → Authentication → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database → Start in production mode.**
   Pick the `asia-southeast1` region — it's the closest one, so the till feels
   snappier.
4. **Project settings → Your apps → Web (`</>`)** and copy the config values.
5. Paste the rules from `firestore.rules` into **Firestore → Rules → Publish.**
   They give staff full access to products and sales, restrict account creation
   to admins, and make a recorded sale permanent.
6. Set up your first admin login — see **[ACCOUNTS.md](ACCOUNTS.md)**. Takes
   about 10 minutes and you only do it once.

### 2. The app

```bash
cp .env.example .env      # then paste your Firebase values in
npm install
npm run dev
```

Open the address it prints. Sign in, pick which laptop you're on, go to **Products**,
and either add your 20–30 items or hit **Load sample catalogue** to try the
offers with realistic data first.

### 3. Put it on both laptops

Running `npm run dev` on the fair wifi and opening the URL on the other laptop
works, but it dies if that machine sleeps. Deploy instead:

```bash
npm run build
npx firebase-tools login
npx firebase-tools init hosting     # public directory: dist
npx firebase-tools deploy
```

Now both laptops just open the same URL. Add it to the dock and taskbar.

### 4. Touch 'n Go QR

Save your merchant QR as `public/tng-qr.png` before building. It appears
full-width on the payment screen.

### 5. Cash drawer (Windows only)

See `helper/README.md`. Short version: install Node, double-click
`helper/start-drawer-helper.bat`, leave the window open.

---

## Selling

Tap a tile, scan a barcode, or type a name and press Enter. The scan box holds
focus by itself, so a barcode gun works with no setup — it's just a fast
keyboard. One exact barcode match adds instantly; one search match adds on
Enter.

Every line can be edited mid-sale: `−` and `+` for quantity, **Remove** to
drop it, **Discount** for a manual price cut on that line alone.

## Offers

Set per product, under **Products**. A live preview under the form shows what
the till will actually charge at various quantities before you save.

**Buy X, get Y free.** The cashier just keeps scanning. Every complete group of
X+Y makes Y of them free. Buy 12 free 1 at RM10: 24 scans is RM230, 26 scans is
RM240.

**Bulk prices.** Enter as many tiers as you like — 1 for RM10, 2 for RM18 — and
the till finds the cheapest combination itself, so 5 items become 2+2+1. It
isn't naive about it: with 3 for RM27 and 5 for RM40, six items come out as 5+1
= RM50 rather than 3+3 = RM54. Where buying slightly more would genuinely cost
less, the line says so, so the cashier can offer it.

**Manual discounts override the product's offer.** Never both stacked. The
discount dialog shows you the offer it's replacing and what each option costs.

The maths is covered by tests, including every example above:

```bash
npm test
```

## Payments

Only the methods that laptop accepts appear.

- **Cash** — quick-note buttons (+RM1 through +RM100), an **Exact** button, and
  a live change figure that tells you when you're still short.
- **Touch 'n Go** — shows your QR, waits for you to confirm the customer's paid
  screen, takes an optional reference.
- **Card** — you key the amount into the terminal and confirm once it approves.
  Optional approval code goes on the receipt.

## Receipts

Every completed sale prints through the normal Windows print dialog, laid out
for 80mm thermal paper. To make it print without asking each time, launch
Chrome with kiosk printing and your receipt printer set as the system default:

```
chrome.exe --kiosk-printing --app=https://your-project.web.app
```

Reprint any sale from the **Sales** tab.

## Cash drawer

Cash sales only, and only on the Windows till. The app posts to the local
helper on port 9110, which sends `CASHDRAWER 0,32,32` to the printer. It waits
1.2 seconds at most, and a failure shows a small note telling the cashier to
use the key. **A drawer problem never blocks or delays a sale.**

## When the wifi drops

Firestore caches locally. The till keeps selling, sales queue on the laptop,
and everything syncs when the connection returns. The top-right pill turns
amber while you're offline. Receipt numbers fall back to a local sequence
(`WL0001`) that still can't collide with the other laptop.

---

## Before the doors open

- [ ] Every cashier can sign in on both laptops, passwords written down
- [ ] Both laptops open the app and show the right till name
- [ ] Products entered, prices checked against your price list
- [ ] Offers set, and the live preview matches what you promised in your signage
- [ ] Print a test receipt from both laptops
- [ ] Drawer opens from the Windows till on a RM1 test cash sale
- [ ] `tng-qr.png` is the right merchant QR, and scan it yourself to be sure
- [ ] Card terminal paired and taking a test payment
- [ ] Both laptops set to never sleep, and plugged in
- [ ] Void the test sales, or note them so the totals make sense on day four

## Who can do what

Admins and cashiers both sell, manage products and read the history. Only an
admin creates or blocks staff accounts. There's no self-registration — see
[ACCOUNTS.md](ACCOUNTS.md).

Every sale records the cashier who rang it up, on the receipt and in the Sales
tab.

## Structure

```
src/lib/pricing.js       offers, bulk optimiser, discounts, money — all in sen
src/lib/pricing.test.mjs the spec's worked examples, as tests
src/lib/db.js            till config, products, sales, receipt numbers
src/lib/auth.js          sign-in, roles, admin-only account creation
src/pages/Login.jsx      sign-in screen
src/pages/Users.jsx      staff management, admin only
src/lib/drawer.js        drawer client with its hard timeout
src/pages/Sell.jsx       grid, receipt tape, payment flows
src/pages/Admin.jsx      products and the offer editor with live preview
src/pages/Report.jsx     takings by method, best sellers, reprints
src/components/Receipt.jsx  the 80mm thermal layout
helper/                  the cash drawer helper for Windows
```

Money is stored everywhere as integer sen. RM10.00 is `1000`. Nothing in this
codebase does float arithmetic on money, and nothing should start.
