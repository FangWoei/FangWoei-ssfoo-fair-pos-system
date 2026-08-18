/**
 * Confirming QR and card payments.
 *
 * Neither can be verified automatically here. A static DuitNow QR standee has
 * no callback, and a standalone card terminal has no link to the till.
 * Real verification would need a payment gateway with dynamic QR and webhooks,
 * plus a backend to receive them.
 *
 * So a human confirms, and the design job is to make that confirmation
 * deliberate rather than reflexive, and to leave enough of a trail to
 * reconcile at closing.
 *
 * Three things do that work:
 *
 *   1. The confirm button names what the cashier must be looking at. Not
 *      "OK" — "Customer's phone shows PAID". A button that states the check
 *      is much harder to press on autopilot than one that just agrees.
 *   2. A reference is recorded. For card it is the approval code from the
 *      slip, which is what a bank will ask for in a dispute.
 *   3. Anything confirmed without a reference is marked unverified and shows
 *      up flagged in the Sales tab, so it can be chased while the day is
 *      still fresh.
 *
 * Set `requireRef: true` on a method to refuse confirmation without one.
 * Card is the candidate — it is the one with chargebacks — but it costs a few
 * seconds per sale, so it is off by default. Turn it on if the fair is quiet
 * enough to type an approval code every time.
 */

export const PAYMENT_CHECKS = {
  cash: {
    // Cash is counted in the drawer, not confirmed against a screen.
    confirmLabel: "Take payment",
    requireRef: false,
  },

  qr: {
    title: "DuitNow QR",
    instruction:
      "Point the standee at the customer. Any bank app or e-wallet works — " +
      "TNG, Boost, GrabPay, MAE, Maybank, CIMB. Wait for their success " +
      "screen and check the amount on it matches the amount below.",
    confirmLabel: "Customer's phone shows PAID",
    declineLabel: "Not paid — go back",
    refLabel: "Reference from their screen (optional)",
    refHint:
      "The last few digits are enough. It is what lets you match this sale " +
      "against the Public Bank merchant records at closing.",
    requireRef: false,
    warnWithoutRef: true,
  },

  card: {
    title: "Card",
    instruction:
      "Key the amount into the terminal. Wait for it to print an APPROVED " +
      "slip. A screen that says approved without a slip is not approved.",
    confirmLabel: "Terminal shows APPROVED",
    declineLabel: "Declined — go back",
    refLabel: "Approval code from the slip",
    refHint:
      "Six digits on the merchant copy. This is what the bank asks for if " +
      "the payment is ever disputed, and the till cannot recover it later.",
    requireRef: false,
    warnWithoutRef: true,
  },
};

/** A sale is verified when its method needed no reference, or one was given. */
export function isVerified(method, ref) {
  const cfg = PAYMENT_CHECKS[method];
  if (!cfg?.warnWithoutRef) return true;
  return Boolean(String(ref || "").trim());
}

/**
 * Does this look like a customer's payment code rather than a reference?
 *
 * Your barcode scanner is a keyboard, and the reference box is focused when
 * the confirm dialog opens. So it is genuinely easy to scan the rotating code
 * from a customer's TNG app straight into it — and that code is a live
 * payment credential, not a receipt number. It should never reach Firestore.
 *
 * Consumer-presented codes across TNG, DuitNow, Alipay and WeChat are long
 * runs of digits, typically 16 to 24. Real references are shorter: a card
 * approval code is six digits, a TNG transaction reference is alphanumeric.
 *
 * Scanning the customer's code cannot take payment anyway — that needs an
 * acquirer API with your merchant credentials. The TNG Merchant app does it
 * properly; this till only records what already happened.
 */
export function looksLikePaymentToken(value) {
  const v = String(value || "").replace(/\s/g, "");
  return /^\d{16,24}$/.test(v);
}
