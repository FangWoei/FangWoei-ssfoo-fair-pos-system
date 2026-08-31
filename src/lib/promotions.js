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

   The old "3 for RM75 + 3 free 200ml bottles" 600ml deal has been removed.
   In its place: buy 3 × 600ml (at least 2 of the 3 must be Oat & Milk), get
   a 4th 600ml bottle of ANY flavour free — still RM75 total.

   Written below as "4 bottles, RM75 total, at least 2 must be Oat" rather
   than "3 charged + a separate free line", even though the two are the same
   money. Reason: the free bottle is the SAME product as the paid ones
   (unlike the old deal, whose free gift was a different, smaller product).
   The scan-gate/gift-ledger machinery below tracks free stock by matching it
   against a DIFFERENT product than the one that earned it; when "earn" and
   "free" are the identical product, that machinery can mark the wrong unit
   free (one of the three PAYING bottles) instead of the fourth. Pricing the
   whole group of 4 as one bundle sidesteps that risk and lands on the same
   total. The only behavioural difference from "3 for RM75, plus a free 4th
   if taken": bringing only 3 bottles (not taking a 4th) does NOT get RM75 —
   full retail applies until a 4th joins them. That matches how the deal is
   meant to work — the free bottle is real stock meant to leave the stall.
   ───────────────────────────────────────────────────────────────────────── */

/* The free-trial-box promotion was removed along with the tiered diaper plan:
   it keyed off buying 4 packs, which means nothing under buy-2-free-1.

   To bring it back, add an entry of type 'bundle-gift' with
   require: { tag: 'diaper', qty: N }, gifts: [{ tag: 'diapertrial', qty: 1,
   label: 'Diaper trial box (any one size)' }] and optionalGifts: true.

   Until then the eight trial-box products are marked "free-gift stock only"
   with no promotion giving them away, so they cannot be scanned at all. The
   Products page flags them as unsellable. Untick that box on each one if you
   want to hand them out or sell them. */

export const PROMOTIONS = [
  {
    id: "h2t600-buy3free1",
    name: "Head to Toe 600ml — buy 3 free 1",
    short: "Buy 3 free 1 (600ml)",
    type: "bundle-fixed",

    /* 4 bottles of new-packaging 600ml — the 3 bought plus the free 4th —
       ring together as one RM75 group. Flavours may be MIXED, but at least
       2 of the 4 must be Oat & Milk, which is what moves the Oat stock.
       3 Calming + 1 Oat does not qualify; 2 Calming + 2 Oat does; 4 Oat
       does (trivially, since every one of them matches). */
    /* Matched by name so it works without tagging anything. If you rename one
       of these products, change it here too — or tag them `h2t600new` plus a
       `flavour:` tag and swap `names` for `tag`. */
    require: {
      names: [
        "BB HTT600 CALMING - WTP",
        "BB HTT600 OAT - WTP",
        "BB HTT600 CV - WTP",
      ],
      qty: 4,
      /* At least `min` of the group must be Oat & Milk. */
      sameOrInclude: {
        names: ["BB HTT600 OAT - WTP"],
        label: "BB HTT600 OAT - WTP",
        min: 2,
      },
    },
    price: 7500,
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
    id: "diaper-4-free-1",
    name: "Diapers — buy 4, free 1",
    short: "Buy 4 free 1",
    type: "bundle-fixed",

    /* Five packs for RM143.60, being 4 × RM35.90 with the fifth free.
       Sizes mix freely — 2 tape + 3 pants is a set, so is 5 of one size.

       A fixed bundle price rather than "pay for 4 at the shelf price", so the
       total is RM143.60 whatever the individual sizes are priced at. Change
       the price here, not in Products. */
    require: { tag: "diaper", qty: 5 },
    price: 14360,
  },
];

import { priceCart } from "./pricing.js";

/**
 * Turns the "buy X, free Y of other products" offers set in the Products page
 * into promotion rules.
 *
 * A gift group is "this many free, chosen from these products". That choice is
 * the point: buy 3 shampoo and take 2 free conditioners, and the customer
 * picks which two — one Original and one Oat, or two Oat. The cashier just
 * scans what the customer chose, and the till allows exactly two.
 *
 * Written this way, the promotion needs no code. Add a product, tick it into a
 * gift group, done.
 */
export function promotionsFromProducts(products = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set();
  const out = [];

  const nameFor = (ids, fallback) => {
    if (ids.length === 1) return byId.get(ids[0])?.name || fallback;
    const names = ids.map((id) => byId.get(id)?.name).filter(Boolean);
    return names.length <= 2 ? names.join(" / ") : `any ${names.length} sizes`;
  };

  for (const p of products) {
    const gift = giftConfigOf(p);
    if (!gift) continue;

    /* The buy side may span several products: four nappies in ANY mix of
       eight sizes. Leave the trigger list empty and it is just this product. */
    const triggerIds = gift.triggerIds?.length
      ? [...new Set([p.id, ...gift.triggerIds])].sort()
      : [p.id];

    /* Set the same group promotion on more than one of its members — easy to
       do when there are eight sizes — and it would otherwise be counted once
       per member, giving away eight trial boxes instead of one. Identical
       rules collapse into one. */
    const signature = JSON.stringify([
      triggerIds,
      gift.buyQty,
      gift.giftGroups.map((g) => [g.qty, [...g.productIds].sort()]),
    ]);
    if (seen.has(signature)) continue;
    seen.add(signature);

    out.push({
      id: `product-gift-${triggerIds.join("-")}`,
      name: `${nameFor(triggerIds, p.name)} — buy ${gift.buyQty}`,
      short: `Buy ${gift.buyQty} free ${gift.giftGroups.reduce(
        (s, g) => s + Number(g.qty || 0),
        0,
      )}`,
      type: "bundle-gift",
      require: { productIds: triggerIds, qty: Number(gift.buyQty) },
      gifts: gift.giftGroups.map((g) => ({
        productIds: g.productIds,
        qty: Number(g.qty),
        label: nameFor(g.productIds, "free item"),
      })),
    });
  }

  return out;
}

/**
 * A product's free-gift setup, if it has a usable one.
 *
 * This lives in its own field rather than inside `offer`, so a product can
 * carry BOTH at once: a bulk tier that changes its own price, and a gift that
 * hands over different products. They do unrelated jobs and there is no reason
 * one should exclude the other — a shampoo can be 3 for RM75 *and* come with
 * two free conditioners.
 *
 * `offer.type === 'gift'` is the older shape, still read so products saved
 * before the split keep working.
 */
export function giftConfigOf(product) {
  const raw =
    product?.giftOffer ||
    (product?.offer?.type === "gift" ? product.offer : null);
  if (!raw) return null;

  const buyQty = Number(raw.buyQty) || 0;
  const triggerIds = (raw.triggerIds || []).filter(Boolean);
  const giftGroups = (raw.giftGroups || [])
    .map((g) => ({
      qty: Number(g.qty) || 0,
      productIds: (g.productIds || []).filter(Boolean),
    }))
    .filter((g) => g.qty > 0 && g.productIds.length);

  if (buyQty <= 0 || !giftGroups.length) return null;
  return { buyQty, giftGroups, triggerIds };
}

/**
 * Forms sets under "at least `min` of the group must match X" (min defaults
 * to 1 — "all the same, or mixed with at least one X" when every unit in
 * the pool happens to match X, one set is all that's needed to satisfy it).
 *
 * Each set claims exactly `min` matching units first — dearest matching
 * ones, since the pool arrives sorted dearest-first — then fills the rest
 * of the set from whatever's left, dearest first. A set that can't find
 * `min` matching units among what remains is not formed at all: the
 * leftover units are charged normally rather than "rounding down" a set
 * that never earned the deal.
 *
 * Units are expected sorted dearest first, so the bundles swallow the most
 * expensive bottles — the cheapest outcome for the customer.
 */
function buildSets(units, qty, mustSel) {
  const pool = [...units];
  const sets = [];
  const min = mustSel ? Math.max(1, Number(mustSel.min) || 1) : 0;

  for (;;) {
    if (pool.length < qty) break;
    if (!mustSel) {
      sets.push(pool.splice(0, qty));
      continue;
    }

    const matchPos = [];
    for (let i = 0; i < pool.length; i++) {
      if (matchesSelector(pool[i], mustSel)) matchPos.push(i);
    }
    if (matchPos.length < min) break; // not enough matching stock left

    const claimPos = matchPos.slice(0, min);
    const claimed = claimPos.map((i) => pool[i]);
    // Remove highest indices first so earlier indices stay valid mid-splice.
    [...claimPos].sort((a, b) => b - a).forEach((i) => pool.splice(i, 1));

    const restNeeded = qty - claimed.length;
    if (pool.length < restNeeded) {
      // Can't complete this set — put the claimed units back and stop.
      pool.push(...claimed);
      pool.sort((a, b) => b.unitPrice - a.unitPrice);
      break;
    }
    const rest = pool.splice(0, restNeeded);
    sets.push([...claimed, ...rest]);
  }

  return { sets, leftover: pool };
}

/** "2 for RM70 ×2" reads better on a tape than a list of every bundle. */
function summariseTiers(sizes) {
  const counts = {};
  for (const q of sizes) counts[q] = (counts[q] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([qty, times]) => (times > 1 ? `${times}×${qty}` : `${qty}`))
    .join(" + ");
}

/* ────────────────────────────── the engine ────────────────────────────── */

/**
 * How many complete sets of a promotion the cart has earned.
 *
 * For the 600ml trio this counts per flavour, because a mixed three is not a
 * set: two Calming and one Vanilla earns nothing. For diapers it is a plain
 * count, because sizes may be mixed.
 */
export function earnedSets(promo, lines) {
  const pool = lines.filter(
    (l) => !l.discount && matchesSelector(l, promo.require),
  );
  if (!pool.length) return 0;

  if (promo.require.sameBy === "flavour") {
    const byFlavour = {};
    for (const l of pool) {
      const f = flavourOf(l);
      byFlavour[f] = (byFlavour[f] || 0) + l.qty;
    }
    return Object.values(byFlavour).reduce(
      (s, qty) => s + Math.floor(qty / promo.require.qty),
      0,
    );
  }

  const qty = pool.reduce((s, l) => s + l.qty, 0);

  /* "All the same, or mixed with an Oat" cannot be counted by division: two
     Calming and one CV is three bottles and no set at all. Build the sets and
     count them, or the gifts get promised on a basket that never earned them. */
  if (promo.require.sameOrInclude) {
    const units = [];
    for (const l of pool) for (let i = 0; i < l.qty; i++) units.push(l);
    units.sort((a, b) => b.unitPrice - a.unitPrice);
    return buildSets(units, promo.require.qty, promo.require.sameOrInclude).sets
      .length;
  }

  const sets = Math.floor(qty / promo.require.qty);
  const must = promo.require.mustInclude;
  if (!must) return sets;

  const mustQty = pool
    .filter((l) => matchesSelector(l, must))
    .reduce((s, l) => s + l.qty, 0);

  return Math.min(sets, Math.floor(mustQty / (must.min || 1)));
}

/**
 * What the cart is owed, in free items, across EVERY promotion at once.
 *
 * Gifts must be counted globally, not promotion by promotion. Two promotions
 * that give away the same 200ml bottle used to be tallied separately: the
 * first claimed the bottles, the second saw none left and demanded more, and
 * the scan gate — which knew they were already claimed — refused to supply
 * them. Payment could never complete and there was no way out of it.
 *
 * Counting once, against the total entitlement, means the gate and the
 * blockers can never disagree.
 *
 * Gifts are grouped by WHAT they match, so "1 free Calming 200ml" from one
 * promotion and "1 free Calming 200ml" from another add up to two.
 */
export function giftLedger(lines, promotions = PROMOTIONS) {
  const eligible = lines.filter((l) => !l.discount && Number(l.qty) > 0);
  const bySig = new Map();

  for (const promo of promotions) {
    const sets = earnedSets(promo, eligible);
    if (!sets) continue;

    for (const gift of promo.gifts || []) {
      /* The signature must cover EVERY way a gift can be identified. Leave
         `names` out and two different name-matched gifts hash to the same
         key, collapse into one entitlement, and the second one is charged
         instead of given. */
      const sig = JSON.stringify([
        gift.tag || "",
        gift.flavour || "",
        [...(gift.productIds || [])].sort(),
        [...(gift.names || [])].map((n) => String(n).toLowerCase()).sort(),
      ]);
      const entry = bySig.get(sig) || {
        sig,
        gift,
        promos: [],
        allowed: 0,
        have: 0,
        lines: [],
        // Only owed if EVERY promotion offering it insists on it.
        required: false,
      };
      entry.allowed += sets * gift.qty;
      if (!promo.optionalGifts) entry.required = true;
      if (!entry.promos.includes(promo.name)) entry.promos.push(promo.name);
      bySig.set(sig, entry);
    }
  }

  for (const entry of bySig.values()) {
    entry.lines = eligible.filter((l) => matchesGift(l, entry.gift));
    entry.have = entry.lines.reduce((s, l) => s + l.qty, 0);
  }

  return [...bySig.values()];
}

/**
 * Can this product be scanned into the cart right now?
 *
 * Gift barcodes are refused until the cart has earned them. A cashier scanning
 * a free 200ml before the three 600ml are in gets told why, rather than the
 * till accepting it and only objecting at the moment of payment — by which
 * point the bottle is already in the bag.
 *
 * Scan the fourth diaper and the trial box unlocks. Scan three 600ml of one
 * flavour and the two 200ml barcodes unlock. Break the set by removing a
 * bottle and they lock again.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkCanAdd(product, lines, promotions = PROMOTIONS) {
  /* A promotion must never block the product that EARNS it. Scanning the
     third bottle is how the free ones get unlocked in the first place. */
  for (const promo of promotions) {
    if (matchesSelector(product, promo.require)) return { ok: true };
  }

  // Which gift entitlements does this product answer to?
  const ledger = giftLedger(lines, promotions).filter((e) =>
    matchesGift(product, e.gift),
  );

  // Not a gift of anything currently in play — check whether it is a gift at
  // all, so an unearned one can still be explained rather than sold silently.
  if (!ledger.length) {
    const potential = [];
    for (const promo of promotions) {
      for (const gift of promo.gifts || []) {
        if (matchesGift(product, gift)) potential.push(promo);
      }
    }
    if (!potential.length) return { ok: true };

    const closest = potential.reduce((a, b) =>
      progressOf(b, lines) > progressOf(a, lines) ? b : a,
    );
    const why = needMessage(closest, lines);
    return product.giftOnly
      ? { ok: false, reason: why }
      : { ok: true, charged: true, note: `Charged at normal price — ${why}` };
  }

  if (ledger.some((e) => e.have < e.allowed)) return { ok: true };

  const e = ledger[0];
  const why = `All ${e.allowed} free × ${e.gift.label} already scanned for ${e.promos.join(" + ")}`;
  return product.giftOnly
    ? { ok: false, reason: why }
    : { ok: true, charged: true, note: `Charged at normal price — ${why}` };
}

function progressOf(promo, lines) {
  return lines
    .filter((l) => !l.discount && matchesSelector(l, promo.require))
    .reduce((s, l) => s + l.qty, 0);
}

function needMessage(promo, lines) {
  const pool = lines.filter(
    (l) => !l.discount && matchesSelector(l, promo.require),
  );
  const have = pool.reduce((s, l) => s + l.qty, 0);

  /* Name the actual constraint. "Scan 1 more" is useless advice when the
     basket already has three bottles and what it is missing is an Oat. */
  const sameOr = promo.require.sameOrInclude;
  if (sameOr) {
    const min = Math.max(1, Number(sameOr.min) || 1);
    if (have < promo.require.qty) {
      return `${promo.name} needs ${promo.require.qty - have} more`;
    }
    // Enough bottles, but no valid set — so the mix is the problem.
    return `${promo.name}: needs at least ${min} × ${
      sameOr.label || (sameOr.names || [])[0] || "required bottle"
    } in every ${promo.require.qty}`;
  }

  const must = promo.require.mustInclude;
  if (must) {
    const mustQty = pool
      .filter((l) => matchesSelector(l, must))
      .reduce((s, l) => s + l.qty, 0);
    if (mustQty < (must.min || 1)) {
      return `${promo.name} needs at least ${must.min || 1} × ${
        must.label || must.flavour
      } in every ${promo.require.qty}`;
    }
    const short = promo.require.qty - (have % promo.require.qty);
    return `${promo.name} needs ${short} more — ${have} scanned so far`;
  }

  if (promo.require.sameBy === "flavour") {
    const byFlavour = {};
    for (const l of pool) {
      const f = flavourOf(l) || "unknown";
      byFlavour[f] = (byFlavour[f] || 0) + l.qty;
    }
    const best = Object.entries(byFlavour).sort((a, b) => b[1] - a[1])[0];
    if (!best) {
      return `${promo.name} needs ${promo.require.qty} of one flavour first`;
    }
    const short = promo.require.qty - (best[1] % promo.require.qty);
    return `${promo.name} needs ${promo.require.qty} of ONE flavour — ${short} more ${best[0]}, and flavours cannot be mixed`;
  }

  const short = promo.require.qty - (have % promo.require.qty);
  return have === 0
    ? `${promo.name} needs ${promo.require.qty} first — none scanned yet`
    : `${promo.name} needs ${short} more — ${have} scanned so far`;
}

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

/**
 * A selector picks products either by tag (the promotions written in this
 * file) or by an explicit list of ids (the ones built in the Products page).
 * Ids are how a shopkeeper thinks — "these three bottles" — and tags are how
 * a rule stays true as the catalogue changes. Both are useful, so both work.
 */
function matchesSelector(line, sel) {
  if (!sel) return false;

  /* Match by product NAME as well as by id or tag. Names are the one handle
     that already exists on every product without anyone setting it up, which
     matters when a rule has to be corrected mid-trading and there is no time
     to go through the catalogue adding tags. */
  if (Array.isArray(sel.names) && sel.names.length) {
    const n = String(line.name || "")
      .trim()
      .toLowerCase();
    return sel.names.some((x) => String(x).trim().toLowerCase() === n);
  }

  if (Array.isArray(sel.productIds) && sel.productIds.length) {
    return sel.productIds.includes(line.productId ?? line.id);
  }
  /* A selector may name a flavour on its own — "at least one Oat in every
     three" says nothing about tags, because the pool has already been narrowed
     to 600ml bottles by the promotion's own requirement. */
  if (!sel.tag) {
    return sel.flavour ? flavourOf(line) === sel.flavour : false;
  }
  return (
    hasTag(line, sel.tag) && (!sel.flavour || flavourOf(line) === sel.flavour)
  );
}

const matchesGift = (line, gift) => matchesSelector(line, gift);

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

  /* Units of each line already given away free. Without this, a bottle that
     is the gift of two promotions gets zero-rated twice and the savings total
     counts it twice — the price comes out right, the reported discount does
     not. */
  const claimed = {};

  // A manual discount always wins, so those lines sit out of every promotion.
  const eligible = lines.filter((l) => !l.discount && Number(l.qty) > 0);

  for (const promo of promotions) {
    if (promo.type === "bundle-fixed") runBundleFixed(promo);
    else if (promo.type === "mix-free") runMixFree(promo);
    else if (promo.type === "bundle-gift") runBundleGift(promo);
  }

  /* Gifts are settled once, against the combined entitlement of every
     promotion — see giftLedger. Doing it per promotion double-counts the
     savings and can deadlock the sale. */
  for (const entry of giftLedger(lines, promotions)) {
    let free = Math.min(entry.allowed, entry.have);
    let saving = 0;

    for (const l of entry.lines) {
      const take = Math.min(l.qty, free);
      free -= take;
      const charged = l.unitPrice * (l.qty - take);
      linePrices[l.key] = charged;
      if (take > 0) {
        saving += l.unitPrice * take;
        lineNotes[l.key] =
          take < l.qty
            ? `${take} of ${l.qty} free`
            : `Free — ${entry.promos[0]}`;
      }
    }

    if (entry.required && entry.have < entry.allowed) {
      const short = entry.allowed - entry.have;
      blockers.push({
        promo: entry.promos.join(" + "),
        need: short,
        label: entry.gift.label,
        message: `Scan ${short} more × ${entry.gift.label} — free with ${entry.promos.join(" + ")}`,
      });
    }

    if (saving > 0) {
      applied.push({
        id: `gift-${entry.sig}`,
        name: `Free ${entry.gift.label}`,
        times: Math.min(entry.allowed, entry.have),
        saving,
      });
    }
  }

  /* Fixed-price bundles: "any 4 for RM160", and now several tiers at once.
     Mixing is allowed unless `sameBy` says otherwise. */
  function runBundleFixed(promo) {
    const pool = eligible.filter((l) => matchesSelector(l, promo.require));
    if (!pool.length) return;

    // One tier or many — a single qty/price is just a one-tier deal.
    const tiers = (
      promo.tiers || [{ qty: promo.require.qty, price: promo.price }]
    )
      .map((t) => ({ qty: Number(t.qty), price: Number(t.price) }))
      .filter((t) => t.qty > 0 && t.price >= 0)
      .sort((a, b) => a.qty - b.qty);
    if (!tiers.length) return;

    // Group first — the 600ml trio may not mix flavours, diapers may mix sizes.
    const groups = {};
    for (const l of pool) {
      const key = promo.require.sameBy === "flavour" ? flavourOf(l) : "*";
      (groups[key] ||= []).push(l);
    }

    let times = 0;
    let saving = 0;

    for (const [groupKey, group] of Object.entries(groups)) {
      // Work in units: sizes in one deal can have different prices.
      const units = [];
      for (const l of group) for (let i = 0; i < l.qty; i++) units.push(l);
      if (!units.length) continue;

      /* Dearest first, so a bundle swallows the most expensive items — the
         cheapest outcome for the customer, and the one they would arrange
         themselves if they knew the rule. */
      units.sort((a, b) => b.unitPrice - a.unitPrice);
      const n = units.length;

      /* Where a set must contain something specific, build the sets by hand:
         one Oat first, then fill the rest from whatever is dearest. Left to
         the plain dearest-first sweep, three Calmings would form a "set" that
         does not qualify, and the customer would be charged the deal price
         for a basket that never earned it. */
      const setRule = promo.require.sameOrInclude || promo.require.mustInclude;
      if (setRule) {
        const perLine = {};
        const built = buildSets(units, promo.require.qty, setRule);
        const used = [];

        for (const set of built.sets) {
          const retail = set.reduce((sum, u) => sum + u.unitPrice, 0);
          if (promo.price >= retail) {
            built.leftover.push(...set); // an offer, never a penalty
            continue;
          }
          let left = promo.price;
          set.forEach((u, k) => {
            const share =
              k === set.length - 1
                ? left
                : retail
                  ? Math.round((promo.price * u.unitPrice) / retail)
                  : Math.round(promo.price / set.length);
            left -= share;
            perLine[u.key] = (perLine[u.key] || 0) + share;
          });
          saving += retail - promo.price;
          used.push(promo.require.qty);
        }

        for (const u of built.leftover) {
          perLine[u.key] = (perLine[u.key] || 0) + u.unitPrice;
        }

        if (used.length) {
          for (const l of group) {
            linePrices[l.key] = perLine[l.key] ?? l.unitPrice * l.qty;
            lineNotes[l.key] = promo.short;
          }
          times += used.length;
        }
        continue;
      }

      /* Biggest bundle first, then the next, then singles.
         NOT the cheapest combination. Four packs is the headline deal and must
         ring as one four, even where two pairs would come to less — the pairs
         are a smaller offer, and the four carries the free trial box with it.
         Charging the cheaper split would hand out the gift on a cheaper
         basket, which is not the deal that is advertised.

         A tier is still skipped where it would cost MORE than the units are
         worth at retail: an offer must never be a penalty. */
      const perLine = {};
      const used = [];
      let taken = 0;

      for (const t of [...tiers].sort((a, b) => b.qty - a.qty)) {
        while (n - taken >= t.qty) {
          const set = units.slice(taken, taken + t.qty);
          const retail = set.reduce((sum, u) => sum + u.unitPrice, 0);
          if (t.price >= retail) break; // and every later block is cheaper still

          // Split the bundle price across its units in proportion to their own
          // price, so every line shows something defensible on the receipt.
          let left = t.price;
          set.forEach((u, k) => {
            const share =
              k === set.length - 1
                ? left
                : retail
                  ? Math.round((t.price * u.unitPrice) / retail)
                  : Math.round(t.price / set.length);
            left -= share;
            perLine[u.key] = (perLine[u.key] || 0) + share;
          });

          saving += retail - t.price;
          used.push(t.qty);
          taken += t.qty;
        }
      }

      // Whatever did not make it into a bundle is charged normally.
      for (let k = taken; k < n; k++) {
        const u = units[k];
        perLine[u.key] = (perLine[u.key] || 0) + u.unitPrice;
      }

      if (!used.length) continue;

      const label = summariseTiers(used);
      for (const l of group) {
        linePrices[l.key] = perLine[l.key] ?? l.unitPrice * l.qty;
        lineNotes[l.key] =
          `${label}${groupKey !== "*" ? ` · ${groupKey}` : ""}`;
      }
      times += used.length;
    }

    if (!times) return;
    applied.push({ id: promo.id, name: promo.name, times, saving });
  }

  /* Buy 1 free 1 across a whole range, cheapest goes free. */
  function runMixFree(promo) {
    const pool = eligible.filter((l) => matchesSelector(l, promo.require));
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
    const pool = eligible.filter((l) => matchesSelector(l, promo.require));
    const qty = pool.reduce((s, l) => s + l.qty, 0);
    const times = Math.floor(qty / promo.require.qty);
    if (!times) return;

    for (const l of pool) lineNotes[l.key] ||= promo.short;
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

/**
 * Which promotions a product takes part in, and how.
 *
 * Configuration errors here are invisible: a trial box with a mistyped tag
 * looks identical to a correct one, and only shows up as a promotion that
 * refuses to complete at the counter. This lets the Products page say plainly
 * "this product is in no promotion", which is the fact you actually need.
 */
export function promoRolesFor(product, promotions = PROMOTIONS) {
  const earns = [];
  const freeIn = [];

  for (const promo of promotions) {
    if (matchesSelector(product, promo.require)) earns.push(promo.name);
    for (const gift of promo.gifts || []) {
      if (matchesGift(product, gift)) {
        freeIn.push(promo.name);
        break;
      }
    }
  }

  return { earns, freeIn };
}
