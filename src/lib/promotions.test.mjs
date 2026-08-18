import assert from "node:assert";
import {
  applyPromotions,
  checkCanAdd,
  earnedSets,
  PROMOTIONS,
} from "./promotions.js";

const cases = [];
const check = (n, f) => cases.push([n, f]);

let seq = 0;
const line = (name, unitPrice, qty, tags) => ({
  key: `k${seq++}`,
  productId: name,
  name,
  unitPrice,
  qty,
  tags,
  discount: null,
});

// The catalogue this promo touches. Prices are placeholders except RM75.
const c600 = (q) =>
  line("H2T 600ml Calming", 3500, q, ["h2t600new", "flavour:calming"]);
const o600 = (q) =>
  line("H2T 600ml Oat", 3500, q, ["h2t600new", "flavour:oat"]);
const v600 = (q) =>
  line("H2T 600ml Vanilla", 3500, q, ["h2t600new", "flavour:vanilla"]);
const calm200 = (q) =>
  line("H2T 200ml Calming", 1200, q, ["h2t200", "flavour:calming"]);
const oat200 = (q) => line("H2T 200ml Oat", 1200, q, ["h2t200", "flavour:oat"]);

const total = (lines, r) =>
  lines.reduce(
    (s, l) =>
      s +
      (r.linePrices[l.key] !== undefined
        ? r.linePrices[l.key]
        : l.unitPrice * l.qty),
    0,
  );

/* ---------- promo 2: the worked example from the brief ---------- */

check(
  "3 Calming 600ml + 1 Calming 200ml + 2 Oat 200ml = RM75, nothing blocked",
  () => {
    const lines = [c600(3), calm200(1), oat200(2)];
    const r = applyPromotions(lines);
    assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
    assert.equal(total(lines, r), 7500);
    assert.equal(r.applied[0].id, "h2t600-trio");
  },
);

check("gifts missing entirely -> payment blocked, both gifts named", () => {
  const lines = [c600(3)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 2);
  assert.match(r.blockers[0].message, /scan 1 more/);
  assert.match(r.blockers[1].message, /scan 2 more/);
});

check("one gift short -> blocked, and it says how many more", () => {
  const lines = [c600(3), calm200(1), oat200(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0].message, /scan 1 more/);
});

check("only 2 bottles -> no promo, full price, no blocker", () => {
  const lines = [c600(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(r.applied.length, 0);
  assert.equal(total(lines, r), 7000);
});

check("flavours cannot be mixed: 2 calming + 1 vanilla is not a set", () => {
  const lines = [c600(2), v600(1)];
  const r = applyPromotions(lines);
  assert.equal(r.applied.length, 0);
  assert.equal(total(lines, r), 10500);
});

check("two separate flavours, 3 each, = two sets and doubled gifts", () => {
  const lines = [c600(3), o600(3), calm200(2), oat200(4)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 15000); // 2 × RM75
});

check("6 of one flavour = 2 sets, needs double gifts", () => {
  const lines = [c600(6), calm200(1), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 2); // 1 more calming, 2 more oat
});

check("4th bottle is charged normally on top of the set", () => {
  const lines = [c600(4), calm200(1), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(total(lines, r), 7500 + 3500);
});

check("a 200ml bought beyond the free entitlement is charged", () => {
  const lines = [c600(3), calm200(2), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(total(lines, r), 7500 + 1200); // second calming is a normal sale
});

/* ---------- promo 4: kids, buy 1 free 1, mixing allowed ---------- */

const kid = (name, price, q) => line(name, price, q, ["kids"]);

check("2 kids items -> cheaper one free", () => {
  const lines = [kid("Kids shampoo", 2000, 1), kid("Kids lotion", 1500, 1)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 2000);
});

check("5 kids items -> 2 free, the two cheapest", () => {
  const lines = [
    kid("A", 2000, 1),
    kid("B", 1800, 1),
    kid("C", 1500, 1),
    kid("D", 1200, 1),
    kid("E", 1000, 1),
  ];
  const r = applyPromotions(lines);
  // free: 1000 and 1200 -> pay 2000+1800+1500
  assert.equal(total(lines, r), 5300);
});

check("4 of the same kids item -> 2 free", () => {
  const lines = [kid("A", 2000, 4)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 4000);
});

/* ---------- promo 5: diapers, mix sizes, free trial box ---------- */

const dia = (size, q) => line(`Diaper ${size}`, 4500, q, ["diaper"]);
const trial = (q) => line("Diaper trial box M", 1500, q, ["diapertrial"]);

check("4 packs mixed sizes + trial box = trial free", () => {
  const lines = [dia("M", 2), dia("L", 2), trial(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 4 * 4500);
});

check("4 packs but no trial box scanned -> blocked", () => {
  const lines = [dia("M", 4)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0].message, /trial/i);
});

check("3 packs -> no promo, no blocker", () => {
  const lines = [dia("M", 3)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(total(lines, r), 13500);
});

check("8 packs -> two trial boxes required", () => {
  const lines = [dia("M", 8), trial(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0].message, /scan 1 more/);
});

/* ---------- interaction with manual discounts ---------- */

check("a line with a manual discount sits out of promotions", () => {
  const lines = [c600(3), calm200(1), oat200(2)];
  lines[0].discount = { type: "percent", value: 10 };
  const r = applyPromotions(lines);
  assert.equal(r.applied.length, 0);
  assert.equal(r.blockers.length, 0);
});

/* ---------- the scan gate: gift barcodes refused until earned ---------- */

const prod = (name, price, tags) => ({ name, unitPrice: price, tags });
const P_CALM200 = prod("H2T 200ml Calming", 1200, [
  "h2t200",
  "flavour:calming",
]);
const P_OAT200 = prod("H2T 200ml Oat", 1200, ["h2t200", "flavour:oat"]);
const P_TRIAL = prod("Diaper trial box M", 1500, ["diapertrial"]);
const P_600 = prod("H2T 600ml Calming", 3500, ["h2t600new", "flavour:calming"]);

check("empty cart: the free 200ml barcode is refused", () => {
  const r = checkCanAdd(P_CALM200, []);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ONE flavour|same flavour/i);
});

check("two 600ml only: still refused, and it says one more", () => {
  const r = checkCanAdd(P_CALM200, [c600(2)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 more calming/i);
});

check("THREE of one flavour: the gift barcodes unlock", () => {
  const cart = [c600(3)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, true);
  assert.equal(checkCanAdd(P_OAT200, cart).ok, true);
});

check("2 Calming + 1 Vanilla is not a set — gift stays refused", () => {
  const r = checkCanAdd(P_CALM200, [c600(2), v600(1)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /cannot be mixed/i);
});

check("entitlement is one Calming 200ml only — a second is refused", () => {
  const cart = [c600(3), calm200(1)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, false);
  assert.match(checkCanAdd(P_CALM200, cart).reason, /already scanned/i);
});

check("entitlement is two Oat 200ml — third is refused", () => {
  assert.equal(checkCanAdd(P_OAT200, [c600(3), oat200(1)]).ok, true);
  assert.equal(checkCanAdd(P_OAT200, [c600(3), oat200(2)]).ok, false);
});

check("six of one flavour doubles the entitlement", () => {
  assert.equal(checkCanAdd(P_CALM200, [c600(6), calm200(1)]).ok, true);
  assert.equal(checkCanAdd(P_CALM200, [c600(6), calm200(2)]).ok, false);
});

check("3 diapers: trial box refused, says scan 1 more", () => {
  const r = checkCanAdd(P_TRIAL, [dia("M", 3)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 more/);
});

check("4 diapers mixed sizes: trial box unlocks, second one refused", () => {
  assert.equal(checkCanAdd(P_TRIAL, [dia("M", 2), dia("L", 2)]).ok, true);
  assert.equal(
    checkCanAdd(P_TRIAL, [dia("M", 2), dia("L", 2), trial(1)]).ok,
    false,
  );
});

check("8 diapers: two trial boxes allowed, third refused", () => {
  assert.equal(checkCanAdd(P_TRIAL, [dia("M", 8), trial(1)]).ok, true);
  assert.equal(checkCanAdd(P_TRIAL, [dia("M", 8), trial(2)]).ok, false);
});

check("a normal product is never gated", () => {
  assert.equal(checkCanAdd(P_600, []).ok, true);
  assert.equal(checkCanAdd(prod("Kopi O", 400, []), []).ok, true);
});

check("earnedSets counts per flavour, not in total", () => {
  assert.equal(earnedSets(PROMOTIONS[0], [c600(2), v600(1)]), 0);
  assert.equal(earnedSets(PROMOTIONS[0], [c600(3)]), 1);
  assert.equal(earnedSets(PROMOTIONS[0], [c600(3), v600(3)]), 2);
});

/* ---------- product-configured gift offers: buy 3 shampoo, free 2 ---------- */

// Set up in the Products page, no code involved.
const SHAMPOO = {
  id: "sh1",
  name: "Shampoo 400ml",
  price: 2500,
  offer: {
    type: "gift",
    buyQty: 3,
    giftGroups: [{ qty: 2, productIds: ["c1", "c2"] }],
  },
};
const COND_ORI = {
  id: "c1",
  name: "Conditioner Original",
  price: 1800,
  offer: { type: "none" },
};
