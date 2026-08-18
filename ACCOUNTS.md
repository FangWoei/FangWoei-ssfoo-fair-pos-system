# Accounts and roles

Two roles. The only thing that separates them is creating staff.

| | Admin | Cashier |
|---|---|---|
| Sell, take payments, print | yes | yes |
| Add and edit products and offers | yes | yes |
| See sales history and reprint | yes | yes |
| Create and block staff accounts | **yes** | no |

Nobody can sign themselves up. There is no registration screen, and — more to
the point — a login with no profile in Firestore can't read or write anything.
So even someone who calls the Firebase signup API directly ends up with an
account that does nothing.

---

## One-time setup, about 10 minutes

### 1. Turn on email/password sign-in

Firebase console → **Authentication** → **Sign-in method** → **Email/Password**
→ Enable → Save.

You can leave Anonymous switched on or turn it off; the app no longer uses it.

### 2. Publish the new rules

Copy all of `firestore.rules` into Firebase console → **Firestore Database** →
**Rules** → **Publish**.

Do this *before* step 4, or the app will refuse to read anything.

### 3. Create the first admin login

Firebase console → **Authentication** → **Users** → **Add user**.

Enter your email and a password. This creates the login but not the profile —
the app will tell you as much when you sign in.

### 4. Give that login the admin role

Start the app, sign in with what you just made. You'll land on a screen headed
**"This login has no profile yet"** showing your document ID. Copy it, then:

Firebase console → **Firestore Database** → **Start collection**

- Collection ID: `users`
- Document ID: paste the ID from that screen
- Fields:

| Field | Type | Value |
|---|---|---|
| `name` | string | your name |
| `email` | string | the email you signed in with |
| `role` | string | `admin` |
| `active` | boolean | `true` |

Save, go back to the app, hit **Reload**. You're in, and a **Staff** tab
appears in the top bar.

**This is the only account you ever make by hand.** Everything after this is
done in the app.

### 5. Create your cashiers

**Staff** tab → **Create account**. Name, email, password, role. The app makes
the login and the profile together, and — this is the part that usually goes
wrong in Firebase apps — you stay signed in as yourself while it happens.

Emails don't need to be real or receive mail. `ali@ssfoo.fair` is fine.
Passwords must be at least 6 characters; there's a **Suggest one** button.

Write the passwords down. Nothing in the app can show them again.

---

## Day to day

**Blocking someone** takes effect immediately, on both laptops, even mid-shift
— they get bounced to a notice on their next action. Their login still exists,
so unblocking is one click.

**Password resets** aren't in the app. Firebase console → Authentication →
find the user → the three dots → Reset password. If the email is a made-up one
like `ali@ssfoo.fair`, the reset email goes nowhere, so use the console to set
a new password directly, or block that account and create a fresh one.

**Deleting a login** is console-only too, under Authentication. Blocking is
enough for the fair; delete afterwards when you're clearing up.

You can't block or demote yourself, and the app won't let you remove the last
remaining admin. That's deliberate — locking yourself out of your own till at a
fair is not a recoverable situation.

## Receipts and history

Every sale now records who rang it up. The cashier's name prints on the receipt
under "Served by", and there's a **Cashier** column in the Sales tab. Useful
when the float doesn't balance on day three.

## If something is refused

**"Firestore refused that"** on the Staff page — your own profile's `role` isn't
exactly the string `admin`, or the rules haven't been published. Check for a
stray capital or space.

**"Email/password sign-in is switched off"** — step 1 above.

**Signed in but stuck on "This login has no profile yet"** — the document ID in
Firestore must match the ID on that screen character for character. It's easy to
create the document under an auto-generated ID by mistake; delete it and redo
with the pasted ID.
