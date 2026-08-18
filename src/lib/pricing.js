/**
 * Pricing engine.
 *
 * All money is in sen (integers). RM10.00 === 1000.
 * Never use floats for money anywhere in this app.
 *
 * A line is priced by exactly one rule, in this order:
 *   1. manual discount on the line  -> product offer is ignored entirely
 *   2. product offer (freebie / bulk)
 *   3. plain unit price
 */

export const OFFER_NONE = 'none';
export const OFFER_FREEBIE = 'freebie'; // buy X, get Y free
export const OFFER_BULK = 'bulk'; // n for RM y

export function emptyOffer() {
  return { type: OFFER_NONE, buyQty: 0, freeQty: 0, tiers: [] };
}

/** Tiers, normalised: sorted, de-duped by qty (cheapest wins), qty>=2 only. */
export function normaliseTiers(tiers = []) {
  const byQty = new Map();
  for (const t of tiers) {
    const qty = Math.floor(Number(t.qty) || 0);
    const price = Math.round(Number(t.price) || 0);
    if (qty < 2 || price < 0) continue;
    if (!byQty.has(qty) || byQty.get(qty) > price) byQty.set(qty, price);
  }
  return [...byQty.entries()]
    .map(([qty, price]) => ({ qty, price }))
    .sort((a, b) => a.qty - b.qty);
}

/**
 * Cheapest way to buy exactly `qty` units given bundle tiers.
 * Unbounded knapsack over tiers + the single-unit price, which is always
 * available, so an exact cover always exists.
 *
 * 1 for RM10, 2 for RM18, qty 5  -> 2+2+1 = RM46
 * 1 for RM10, 3 for RM27, 5 for RM40, qty 6 -> 5+1 = RM50 (not 3+3 = RM54)
 */
export function bestBulkCombo(qty, unitPrice, tiers) {
  const all = [{ qty: 1, price: unitPrice }, ...normaliseTiers(tiers)];
  const maxTier = all[all.length - 1].qty;

  // Solve a bit past qty so we can spot "buying more costs less".
  const limit = qty + maxTier;
  const dp = new Array(limit + 1).fill(Infinity);
  const pick = new Array(limit + 1).fill(null);
  dp[0] = 0;

  for (let i = 1; i <= limit; i++) {
    for (const t of all) {
      if (t.qty > i) break;
      const cost = dp[i - t.qty] + t.price;
      if (cost < dp[i]) {
        dp[i] = cost;
        pick[i] = t;
      }
    }
  }

  const walk = (n) => {
    const counts = new Map();
    let i = n;
    while (i > 0) {
      const t = pick[i];
      const key = t.qty;
      counts.set(key, (counts.get(key) || 0) + 1);
      i -= t.qty;
    }
    return [...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([tierQty, times]) => {
        const t = all.find((x) => x.qty === tierQty);
        return { qty: tierQty, times, each: t.price, total: t.price * times };
      });
  };

  // Would taking a few more units actually be cheaper? (e.g. 5 for RM40 when
  // they're buying 4 at RM10 each). Worth telling the cashier about.
  let upsell = null;
  for (let m = qty + 1; m <= limit; m++) {
    if (dp[m] < dp[qty] && (!upsell || dp[m] < upsell.total)) {
      upsell = { qty: m, total: dp[m], extra: m - qty, saves: dp[qty] - dp[m] };
    }
  }

  return { total: dp[qty], parts: walk(qty), upsell };
}

/**
 * Buy X free Y. Every complete group of (X+Y) makes Y of them free.
 * Buy 12 free 1 at RM10: 24 -> RM230, 26 -> RM240.
 */
export function freebieCount(qty, buyQty, freeQty) {
  const group = buyQty + freeQty;
  if (group <= 0 || buyQty <= 0 || freeQty <= 0) return 0;
  return Math.floor(qty / group) * freeQty;
}

/**
 * @param {object} line
 * @param {number} line.unitPrice   sen
 * @param {number} line.qty
 * @param {object} [line.offer]
 * @param {object} [line.discount]  { type: 'amount'|'percent', value } value in sen or whole %
 */
export function priceLine({ unitPrice, qty, offer, discount }) {
  const gross = unitPrice * qty;
  const base = {
    gross,
    total: gross,
    saved: 0,
    freeQty: 0,
    rule: 'unit',
    note: '',
    parts: [],
    upsell: null,
  };

  if (qty <= 0 || unitPrice < 0) return { ...base, gross: 0, total: 0 };

  // 1. Manual discount wins outright. Never stacked with an offer.
  if (discount && Number(discount.value) > 0) {
    let off =
      discount.type === 'percent'
        ? Math.round((gross * Math.min(Number(discount.value), 100)) / 100)
        : Math.round(Number(discount.value));
    off = Math.max(0, Math.min(off, gross));
    return {
      ...base,
      total: gross - off,
      saved: off,
      rule: 'discount',
      note:
        discount.type === 'percent'
          ? `Discount ${discount.value}%`
          : `Discount ${formatRM(off)}`,
    };
  }

  const type = offer?.type ?? OFFER_NONE;

  if (type === OFFER_FREEBIE) {
    const free = freebieCount(qty, Number(offer.buyQty), Number(offer.freeQty));
    if (free > 0) {
      const total = unitPrice * (qty - free);
      return {
        ...base,
        total,
        saved: gross - total,
        freeQty: free,
        rule: 'freebie',
        note: `Buy ${offer.buyQty} free ${offer.freeQty} — ${free} free`,
      };
    }
    const group = Number(offer.buyQty) + Number(offer.freeQty);
    const away = group - (qty % group);
    return {
      ...base,
      rule: 'unit',
      note: `${away} more for 1 free`,
    };
  }

  if (type === OFFER_BULK) {
    const tiers = normaliseTiers(offer.tiers);
    if (tiers.length) {
      const { total, parts, upsell } = bestBulkCombo(qty, unitPrice, tiers);
      return {
        ...base,
        total,
        saved: gross - total,
        rule: total < gross ? 'bulk' : 'unit',
        parts,
        upsell,
        note:
          total < gross
            ? 'Bulk ' +
              parts
                .map((p) => (p.times > 1 ? `${p.times}×${p.qty}` : `${p.qty}`))
                .join(' + ')
            : '',
      };
    }
  }

  return base;
}

export function priceCart(lines = []) {
  const priced = lines.map((l) => ({ ...l, priced: priceLine(l) }));
  const gross = priced.reduce((s, l) => s + l.priced.gross, 0);
  const total = priced.reduce((s, l) => s + l.priced.total, 0);
  const qty = priced.reduce((s, l) => s + Number(l.qty || 0), 0);
  return { lines: priced, gross, total, saved: gross - total, qty };
}

/* ---------- money ---------- */

export function formatRM(sen) {
  const n = Math.round(Number(sen) || 0);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${sign}RM${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** "12.50" | "12.5" | "12" | 12.5 -> 1250 */
export function toSen(input) {
  if (input === '' || input == null) return 0;
  const n = Number(String(input).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 1250 -> "12.50", for editable inputs */
export function toRMInput(sen) {
  return (Math.round(Number(sen) || 0) / 100).toFixed(2);
}
