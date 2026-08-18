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
        flavour: "calming",
        qty: 1,
        label: "Head to Toe 200ml Calming Scent",
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

  return products
    .map((p) => ({ product: p, gift: giftConfigOf(p) }))
    .filter(({ gift }) => gift)
    .map(({ product: p, gift }) => ({
      id: `product-gift-${p.id}`,
      name: `${p.name} — buy ${gift.buyQty}`,
      short: `Buy ${gift.buyQty} free ${gift.giftGroups.reduce(
        (s, g) => s + Number(g.qty || 0),
        0,
      )}`,
      type: "bundle-gift",
      require: { productIds: [p.id], qty: Number(gift.buyQty) },
      gifts: gift.giftGroups.map((g) => ({
        productIds: g.productIds,
        qty: Number(g.qty),
        label:
          g.productIds.length === 1
            ? byId.get(g.productIds[0])?.name || "free item"
            : `any ${g.productIds
                .map((id) => byId.get(id)?.name)
                .filter(Boolean)
                .join(" / ")}`,
      })),
    }));
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
  const giftGroups = (raw.giftGroups || [])
    .map((g) => ({
      qty: Number(g.qty) || 0,
      productIds: (g.productIds || []).filter(Boolean),
    }))
    .filter((g) => g.qty > 0 && g.productIds.length);

  if (buyQty <= 0 || !giftGroups.length) return null;
  return { buyQty, giftGroups };
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
  return Math.floor(qty / promo.require.qty);
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
  for (const promo of promotions) {
    /* A promotion must never block the product that EARNS it. Scanning the
       third shampoo is how the free conditioner is unlocked in the first
       place, so a product that is both trigger and gift — which happens when
       a range gives away its own members — has to stay scannable. */
    if (matchesSelector(product, promo.require)) continue;

    for (const gift of promo.gifts || []) {
      if (!matchesGift(product, gift)) continue;

      const allowed = earnedSets(promo, lines) * gift.qty;
      const already = lines
        .filter((l) => matchesGift(l, gift))
        .reduce((s, l) => s + l.qty, 0);

      if (already < allowed) return { ok: true };

      /* Not entitled to another one. What happens next depends on whether this
         thing can be sold on its own.

         Most stock can: a customer may walk up and buy a 200ml bottle without
         any promotion, and refusing that scan loses a sale. So the default is
         to allow it and charge normally.

         Tick "free-gift stock only" on the product for things that exist just
         to be given away — gift-with-purchase boxes, trial packs — and the
         scan is refused instead. */
      if (product.giftOnly) {
        return {
          ok: false,
          reason: allowed
            ? `All ${allowed} free × ${gift.label} already scanned for ${promo.name}`
            : needMessage(promo, lines),
        };
      }

      return {
        ok: true,
        charged: true,
        note: allowed
          ? `${gift.label}: ${allowed} free already scanned, this one is charged`
          : `Not free yet — charged at normal price. ${needMessage(promo, lines)}`,
      };
    }
  }
  return { ok: true };
}

function needMessage(promo, lines) {
  const pool = lines.filter(
    (l) => !l.discount && matchesSelector(l, promo.require),
  );
  const have = pool.reduce((s, l) => s + l.qty, 0);

  if (promo.require.sameBy === "flavour") {
    const byFlavour = {};
    for (const l of pool) {
      const f = flavourOf(l) || "unknown";
      byFlavour[f] = (byFlavour[f] || 0) + l.qty;
    }
    const best = Object.entries(byFlavour).sort((a, b) => b[1] - a[1])[0];
    if (!best) {
      return `Scan ${promo.require.qty} of the same flavour first — ${promo.name}`;
    }
    const short = promo.require.qty - (best[1] % promo.require.qty);
    return `Not free yet: needs ${promo.require.qty} of ONE flavour. ${short} more ${best[0]} — flavours cannot be mixed`;
  }

  const short = promo.require.qty - (have % promo.require.qty);
  return `Not free yet: scan ${short} more to reach ${promo.require.qty} — ${promo.name}`;
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
  if (Array.isArray(sel.productIds) && sel.productIds.length) {
    return sel.productIds.includes(line.productId ?? line.id);
  }
  if (!sel.tag) return false;
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

  // A manual discount always wins, so those lines sit out of every promotion.
  const eligible = lines.filter((l) => !l.discount && Number(l.qty) > 0);

  for (const promo of promotions) {
    if (promo.type === "bundle-fixed") runBundleFixed(promo);
    else if (promo.type === "mix-free") runMixFree(promo);
    else if (promo.type === "bundle-gift") runBundleGift(promo);
  }

  /* 3 of the same flavour at a fixed price, plus scanned gifts. */
  function runBundleFixed(promo) {
    const pool = eligible.filter((l) => matchesSelector(l, promo.require));
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
