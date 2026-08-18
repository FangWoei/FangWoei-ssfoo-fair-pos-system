/**
 * Cart-level promotions.
 *
 * The per-product offers in pricing.js handle anything that lives on ONE
 * product — bulk tiers, buy-X-free-Y. This file handles promotions that span
 * different products, which those cannot express:
 *
 *   - 3 × Head to Toe 600ml, same flavour, RM75, plus free 200ml bottles
 *   - Kids series, buy 1 free 1, mixing allowed across the range
 *   - 4 packs of diaper, sizes mixed, free trial box
 *
 * Products are matched by TAG, not by name or id, so you assign them in the
 * Products page and nothing here needs editing when a product is renamed or
 * re-added. A product carries tags like:
 *
 *     h2t600new, flavour:calming
 *     h2t200, flavour:oat
 *     kids
 *     diaper
 *     diapertrial
 *
 * The gifts have to be SCANNED. They are real stock leaving the stall, so the
 * till wants them in the sale at RM0 rather than silently forgotten. Until
 * they are all in the cart the promotion is incomplete and payment is blocked
 * — see `blockers` in the result.
 */

/* ────────────────────────── the six promotions ──────────────────────────

   Edit prices and quantities here. Anything marked TODO needs a real number
   from you before the fair.

   Promotions 1, 3 and 6 are NOT here: they live on the product itself, set in
   the Products page, because they only involve one product.

     1. Wet wipes carton      → bulk tiers on the wet wipes product
                                 half carton: __ for RM__   TODO
                                 full carton: __ for RM__   TODO
     3. Old packaging 600ml   → a product priced RM9.00
     6. Accessories Cleaning  → buy 2 free 1 on that product
   ───────────────────────────────────────────────────────────────────────── */

export const PROMOTIONS = [
  {
    id: "h2t600-trio",
    name: "Head to Toe 600ml — 3 for RM75",
    short: "3 for RM75 + free 200ml",
    type: "bundle-fixed",

    // 3 bottles of new-packaging 600ml, all the SAME flavour. Calming Scent,
    // Oat & Milk and Vanilla each qualify; a mixed three does not.
    require: { tag: "h2t600new", qty: 3, sameBy: "flavour" },
    price: 7500,

    // Free with every complete set of 3. These must be scanned into the sale.
    gifts: [
      {
        tag: "h2t200",
        flavour: "original",
        qty: 1,
        label: "Head to Toe 200ml Original",
      },
      {
        tag: "h2t200",
        flavour: "oat",
        qty: 2,
        label: "Head to Toe 200ml Oat & Milk",
      },
    ],
  },

  {
    id: "kids-b1g1",
    name: "Kids series — buy 1 free 1",
    short: "Buy 1 free 1",
    type: "mix-free",

    // Mixing across the 5 kids products is allowed. For every 2 that go in
    // the basket, the cheaper one is free — the customer-friendly reading,
    // and the one that avoids arguments at the counter.
    require: { tag: "kids" },
    buyQty: 1,
    freeQty: 1,
  },

  {
    id: "diaper-trial",
    name: "Diapers — 4 packs, free trial box",
    short: "4 packs + free trial box",
    type: "bundle-gift",

    // Sizes may be mixed, so no sameBy here.
    require: { tag: "diaper", qty: 4 },
    gifts: [
      { tag: "diapertrial", qty: 1, label: "Diaper trial box (any one size)" },
    ],
  },
];

import { priceCart } from "./pricing.js";

/* ────────────────────────────── the engine ────────────────────────────── */

const tagsOf = (line) =>
  (Array.isArray(line.tags) ? line.tags : String(line.tags || "").split(","))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

const hasTag = (line, tag) => tagsOf(line).includes(String(tag).toLowerCase());

/** Reads `flavour:oat` off a product's tags. */
export function flavourOf(line) {
  const t = tagsOf(line).find((x) => x.startsWith("flavour:"));
  return t ? t.slice("flavour:".length) : "";
}

const matchesGift = (line, gift) =>
  hasTag(line, gift.tag) && (!gift.flavour || flavourOf(line) === gift.flavour);

/**
 * Works out which promotions apply, what they cost, and what is still missing.
 *
 * @param {Array} lines  cart lines: { key, productId, name, unitPrice, qty, tags, discount, offer }
 * @returns {{
 *   applied: Array,      one entry per promotion that fired, with times and saving
 *   blockers: Array,     human-readable reasons payment is not allowed yet
 *   lineNotes: Object,   line key -> note to print on the tape
 *   linePrices: Object,  line key -> forced total in sen, overriding normal pricing
 * }}
 */
export function applyPromotions(lines, promotions = PROMOTIONS) {
  const applied = [];
  const blockers = [];
  const lineNotes = {};
  const linePrices = {};

  // A manual discount always wins, so those lines sit out of every promotion.
  const eligible = lines.filter((l) => !l.discount && Number(l.qty) > 0);

  for (const promo of promotions) {
    if (promo.type === "bundle-fixed") runBundleFixed(promo);
    else if (promo.type === "mix-free") runMixFree(promo);
    else if (promo.type === "bundle-gift") runBundleGift(promo);
  }

  /* 3 of the same flavour at a fixed price, plus scanned gifts. */
  function runBundleFixed(promo) {
    const pool = eligible.filter((l) => hasTag(l, promo.require.tag));
    if (!pool.length) return;

    // Group by flavour, because a mixed three does not qualify.
    const groups = {};
    for (const l of pool) {
      const key = promo.require.sameBy === "flavour" ? flavourOf(l) : "*";
      (groups[key] ||= []).push(l);
    }

    let times = 0;
    let saving = 0;

    for (const [flavour, group] of Object.entries(groups)) {
      const qty = group.reduce((s, l) => s + l.qty, 0);
      const sets = Math.floor(qty / promo.require.qty);
      if (!sets) continue;

      // Charge the set price for the units inside sets, normal price for the
      // remainder. Spread across the group's lines in order.
      let inSets = sets * promo.require.qty;
      let setTotal = sets * promo.price;
      let normal = 0;

      for (const l of group) {
        const take = Math.min(l.qty, inSets);
        inSets -= take;
        normal += (l.qty - take) * l.unitPrice;
      }

      // Attribute the whole flavour group's price to its lines proportionally,
      // simplest correct approach: put the set price on the first line and
      // charge the rest normally.
      let remainingSet = setTotal;
      let remainingInSets = sets * promo.require.qty;
      for (const l of group) {
        const take = Math.min(l.qty, remainingInSets);
        remainingInSets -= take;
        const share =
          take === 0
            ? 0
            : Math.min(
                remainingSet,
                Math.round((setTotal * take) / (sets * promo.require.qty)),
              );
        remainingSet -= share;
        linePrices[l.key] = share + (l.qty - take) * l.unitPrice;
        if (take > 0) {
          lineNotes[l.key] = `${promo.short}${flavour ? ` · ${flavour}` : ""}`;
        }
      }

      const gross = group.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      saving += gross - (setTotal + normal);
      times += sets;
    }

    if (!times) return;
    claimGifts(promo, times, saving);
  }

  /* Buy 1 free 1 across a whole range, cheapest goes free. */
  function runMixFree(promo) {
    const pool = eligible.filter((l) => hasTag(l, promo.require.tag));
    if (!pool.length) return;

    // Expand to units so mixing works, dearest first.
    const units = [];
    for (const l of pool) for (let i = 0; i < l.qty; i++) units.push(l);
    units.sort((a, b) => b.unitPrice - a.unitPrice);

    const group = promo.buyQty + promo.freeQty;
    const freeCount = Math.floor(units.length / group) * promo.freeQty;
    if (!freeCount) return;

    // The cheapest units are the free ones.
    const freeUnits = units.slice(units.length - freeCount);
    const saving = freeUnits.reduce((s, u) => s + u.unitPrice, 0);

    // Discount each line by however many of its units came out free.
    const freePerLine = {};
    for (const u of freeUnits)
      freePerLine[u.key] = (freePerLine[u.key] || 0) + 1;

    for (const l of pool) {
      const free = freePerLine[l.key] || 0;
      linePrices[l.key] = l.unitPrice * (l.qty - free);
      if (free) lineNotes[l.key] = `${promo.short} — ${free} free`;
    }

    applied.push({ id: promo.id, name: promo.name, times: freeCount, saving });
  }

  /* Buy N from a range, get a gift that must be scanned. */
  function runBundleGift(promo) {
    const pool = eligible.filter((l) => hasTag(l, promo.require.tag));
    const qty = pool.reduce((s, l) => s + l.qty, 0);
    const times = Math.floor(qty / promo.require.qty);
    if (!times) return;

    for (const l of pool) lineNotes[l.key] ||= promo.short;
    claimGifts(promo, times, 0);
  }

  /**
   * Zero-rates the gift lines, and complains if they are not in the cart.
   * Extra gifts beyond the entitlement stay at full price — that is a normal
   * sale of the same product, not a mistake.
   */
  function claimGifts(promo, times, saving) {
    let giftSaving = saving;

    for (const gift of promo.gifts || []) {
      const need = gift.qty * times;
      const matches = eligible.filter((l) => matchesGift(l, gift));
      const have = matches.reduce((s, l) => s + l.qty, 0);

      if (have < need) {
        blockers.push({
          promo: promo.name,
          need: need - have,
          label: gift.label || gift.tag,
          message: `${promo.name}: scan ${need - have} more × ${gift.label || gift.tag}`,
        });
        continue;
      }

      // Charge for anything above the free entitlement.
      let free = need;
      for (const l of matches) {
        const take = Math.min(l.qty, free);
        free -= take;
        linePrices[l.key] = l.unitPrice * (l.qty - take);
        if (take > 0) {
          lineNotes[l.key] =
            `Free with ${promo.short}${take < l.qty ? ` (${take} of ${l.qty})` : ""}`;
          giftSaving += l.unitPrice * take;
        }
      }
    }

    applied.push({ id: promo.id, name: promo.name, times, saving: giftSaving });
  }

  return { applied, blockers, lineNotes, linePrices };
}

/**
 * Prices a cart with per-product offers first, then lets cart-level
 * promotions override the lines they claim. Promotions win, because they are
 * the more specific rule — but a manual discount beats both, and those lines
 * never reach the promotion engine at all.
 */
export function priceCartWithPromotions(lines, promotions = PROMOTIONS) {
  const promo = applyPromotions(lines, promotions);
  const base = priceCart(lines);

  const out = base.lines.map((l) => {
    const forced = promo.linePrices[l.key];
    if (forced === undefined) return l;
    return {
      ...l,
      priced: {
        ...l.priced,
        total: forced,
        saved: l.priced.gross - forced,
        rule: "promo",
        note: promo.lineNotes[l.key] || l.priced.note,
        upsell: null,
      },
    };
  });

  const gross = out.reduce((s, l) => s + l.priced.gross, 0);
  const total = out.reduce((s, l) => s + l.priced.total, 0);
  const qty = out.reduce((s, l) => s + Number(l.qty || 0), 0);

  return {
    lines: out,
    gross,
    total,
    saved: gross - total,
    qty,
    applied: promo.applied,
    blockers: promo.blockers,
  };
}
