import assert from "node:assert";
import {
  applyPromotions,
  checkCanAdd,
  earnedSets,
  PROMOTIONS,
  promotionsFromProducts,
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
const P_CALM200 = {
  ...prod("H2T 200ml Calming", 1200, ["h2t200", "flavour:calming"]),
  giftOnly: true,
};
const P_OAT200 = {
  ...prod("H2T 200ml Oat", 1200, ["h2t200", "flavour:oat"]),
  giftOnly: true,
};
const P_TRIAL = {
  ...prod("Diaper trial box M", 1500, ["diapertrial"]),
  giftOnly: true,
};
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
  giftOnly: true,
};
const COND_OAT = {
  id: "c2",
  name: "Conditioner Oat",
  price: 1800,
  offer: { type: "none" },
  giftOnly: true,
};
const CATALOGUE = [SHAMPOO, COND_ORI, COND_OAT];
const GIFTP = promotionsFromProducts(CATALOGUE);

const cartLine = (p, qty) => ({
  key: `x${seq++}`,
  productId: p.id,
  name: p.name,
  unitPrice: p.price,
  qty,
  tags: [],
  discount: null,
});

check("a gift offer becomes one promotion, with a readable label", () => {
  assert.equal(GIFTP.length, 1);
  assert.equal(GIFTP[0].gifts.length, 1);
  assert.match(GIFTP[0].gifts[0].label, /Original \/ .*Oat/);
});

check("2 shampoo: the free conditioner is refused", () => {
  const r = checkCanAdd(
    { ...COND_OAT, productId: "c2" },
    [cartLine(SHAMPOO, 2)],
    GIFTP,
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 more/);
});

check(
  "3 shampoo: EITHER conditioner unlocks — customer picks the flavour",
  () => {
    const cart = [cartLine(SHAMPOO, 3)];
    assert.equal(
      checkCanAdd({ ...COND_ORI, productId: "c1" }, cart, GIFTP).ok,
      true,
    );
    assert.equal(
      checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
      true,
    );
  },
);

check("the 2 free may be mixed: one of each", () => {
  const cart = [cartLine(SHAMPOO, 3), cartLine(COND_ORI, 1)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
    true,
  );
});

check("or both the same: two Oat", () => {
  const cart = [cartLine(SHAMPOO, 3), cartLine(COND_OAT, 1)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
    true,
  );
});

check("a third free item is refused however they are mixed", () => {
  const cart = [
    cartLine(SHAMPOO, 3),
    cartLine(COND_ORI, 1),
    cartLine(COND_OAT, 1),
  ];
  assert.equal(
    checkCanAdd({ ...COND_ORI, productId: "c1" }, cart, GIFTP).ok,
    false,
  );
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
    false,
  );
});

check("shampoo charged, both conditioners free", () => {
  const lines = [
    cartLine(SHAMPOO, 3),
    cartLine(COND_ORI, 1),
    cartLine(COND_OAT, 1),
  ];
  const r = applyPromotions(lines, GIFTP);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 3 * 2500);
});

check("6 shampoo earns 4 free", () => {
  const cart = [cartLine(SHAMPOO, 6), cartLine(COND_OAT, 3)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
    true,
  );
  const cart4 = [cartLine(SHAMPOO, 6), cartLine(COND_OAT, 4)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart4, GIFTP).ok,
    false,
  );
});

check("a product with no gift offer produces no promotion", () => {
  assert.equal(promotionsFromProducts([COND_ORI, COND_OAT]).length, 0);
});

/* ---------- two prices from one field: RM26.90 each, RM75 for three ---------- */

// Retail price on the product is 26.90. The promotion supplies the set price.
const r600 = (q) =>
  line("H2T 600ml Calming", 2690, q, ["h2t600new", "flavour:calming"]);

check("1 bottle = RM26.90", () => {
  const lines = [r600(1)];
  assert.equal(total(lines, applyPromotions(lines)), 2690);
});

check("2 bottles = RM53.80, no promotion", () => {
  const lines = [r600(2)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 5380);
  assert.equal(r.applied.length, 0);
});

check("3 bottles = RM75.00, not RM80.70", () => {
  const lines = [r600(3), calm200(1), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 7500);
});

check("4 bottles = RM75 + RM26.90 = RM101.90", () => {
  const lines = [r600(4), calm200(1), oat200(2)];
  assert.equal(total(lines, applyPromotions(lines)), 7500 + 2690);
});

check("5 bottles = RM75 + two at retail", () => {
  const lines = [r600(5), calm200(1), oat200(2)];
  assert.equal(total(lines, applyPromotions(lines)), 7500 + 2 * 2690);
});

check("6 bottles = two sets at RM75, not four at retail", () => {
  const lines = [r600(6), calm200(2), oat200(4)];
  assert.equal(total(lines, applyPromotions(lines)), 15000);
});

/* ---------- both at once: a tier on itself AND a gift of others ---------- */

const SHAMPOO2 = {
  id: "sh2",
  name: "Shampoo 600ml",
  price: 2690,
  // its own price drops at 3
  offer: { type: "bulk", tiers: [{ qty: 3, price: 7500 }] },
  // and 3 also earns two free conditioners
  giftOffer: { buyQty: 3, giftGroups: [{ qty: 2, productIds: ["c1", "c2"] }] },
};
const BOTH = promotionsFromProducts([SHAMPOO2, COND_ORI, COND_OAT]);

check("a product can carry a bulk tier and a gift at the same time", () => {
  assert.equal(BOTH.length, 1);
  assert.equal(BOTH[0].require.qty, 3);
});

check("buy 3 at RM75 AND take 2 free conditioners", () => {
  const lines = [
    cartLine(SHAMPOO2, 3),
    cartLine(COND_ORI, 1),
    cartLine(COND_OAT, 1),
  ];
  // promotions zero the gifts; the shampoo line keeps its own bulk price
  const r = applyPromotions(lines, BOTH);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  const shampooStillNormal = r.linePrices[lines[0].key] === undefined;
  assert.ok(
    shampooStillNormal,
    "the gift promo must not touch the trigger line price",
  );
  assert.equal(r.linePrices[lines[1].key], 0);
  assert.equal(r.linePrices[lines[2].key], 0);
});

check("one or two shampoo: normal price, and no free conditioner", () => {
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, [cartLine(SHAMPOO2, 2)], BOTH)
      .ok,
    false,
  );
});

check("the older offer.type gift shape still works", () => {
  const legacy = {
    id: "lg",
    name: "Old",
    price: 100,
    offer: {
      type: "gift",
      buyQty: 2,
      giftGroups: [{ qty: 1, productIds: ["c1"] }],
    },
  };
  assert.equal(promotionsFromProducts([legacy, COND_ORI]).length, 1);
});

/* ---------- the trigger product is never blocked by its own promotion ---------- */

check(
  "a product that is both trigger and gift of the same promo stays scannable",
  () => {
    // The screenshot case: a 600ml that earns free bottles, and is itself listed
    // in the gift group. Scanning it must always work — it is how you EARN them.
    const SELFGIFT = {
      id: "s1",
      name: "HTT600 CV",
      price: 2690,
      giftOnly: true,
      giftOffer: {
        buyQty: 3,
        giftGroups: [{ qty: 2, productIds: ["s1", "c1"] }],
      },
    };
    const promos = promotionsFromProducts([SELFGIFT, COND_ORI]);
    assert.equal(
      checkCanAdd({ ...SELFGIFT, productId: "s1" }, [], promos).ok,
      true,
    );
    assert.equal(
      checkCanAdd(
        { ...SELFGIFT, productId: "s1" },
        [cartLine(SELFGIFT, 2)],
        promos,
      ).ok,
      true,
    );
  },
);

/* ---------- normal stock is charged, not refused ---------- */

const COND_SELLABLE = { ...COND_OAT, giftOnly: false };

check("a sellable gift item is allowed and charged when not yet earned", () => {
  const r = checkCanAdd(
    { ...COND_SELLABLE, productId: "c2" },
    [cartLine(SHAMPOO, 2)],
    GIFTP,
  );
  assert.equal(r.ok, true);
  assert.equal(r.charged, true);
  assert.match(r.note, /Charged at normal price/i);
});

check(
  "a sellable gift item beyond the entitlement is charged, not refused",
  () => {
    const cart = [
      cartLine(SHAMPOO, 3),
      cartLine(COND_ORI, 1),
      cartLine(COND_OAT, 1),
    ];
    const r = checkCanAdd({ ...COND_SELLABLE, productId: "c2" }, cart, GIFTP);
    assert.equal(r.ok, true);
    assert.match(r.note, /already scanned/i);
  },
);

check("gift-only stock is still refused", () => {
  const r = checkCanAdd(
    { ...COND_OAT, productId: "c2" },
    [cartLine(SHAMPOO, 2)],
    GIFTP,
  );
  assert.equal(r.ok, false);
});

/* ---------- a gift claimed by several promotions ---------- */

check(
  "a bottle earned by ONE promotion is free even if another has not earned it",
  () => {
    // Two 600ml lines, each giving away the same 200ml. Only one is in the cart.
    const A = {
      id: "a1",
      name: "600 A",
      price: 2690,
      giftOffer: { buyQty: 3, giftGroups: [{ qty: 1, productIds: ["g1"] }] },
    };
    const B = {
      id: "b1",
      name: "600 B",
      price: 2690,
      giftOffer: { buyQty: 3, giftGroups: [{ qty: 1, productIds: ["g1"] }] },
    };
    const G = { id: "g1", name: "200 Gift", price: 1200, giftOnly: true };
    const promos = promotionsFromProducts([A, B, G]);

    // Three of A earns the gift. B has earned nothing — must not veto.
    const cart = [cartLine(A, 3)];
    assert.equal(checkCanAdd({ ...G, productId: "g1" }, cart, promos).ok, true);

    // And it is free exactly once, not twice.
    const lines = [cartLine(A, 3), cartLine(G, 1)];
    const r = applyPromotions(lines, promos);
    assert.equal(r.linePrices[lines[1].key], 0);
    const totalSaving = r.applied.reduce((s, a) => s + a.saving, 0);
    assert.equal(totalSaving, 1200, "the gift must be counted as saved once");
  },
);

check(
  "with neither promotion earned, the message names the closest one",
  () => {
    const A = {
      id: "a2",
      name: "600 A",
      price: 2690,
      giftOffer: { buyQty: 3, giftGroups: [{ qty: 1, productIds: ["g2"] }] },
    };
    const B = {
      id: "b2",
      name: "600 B",
      price: 2690,
      giftOffer: { buyQty: 3, giftGroups: [{ qty: 1, productIds: ["g2"] }] },
    };
    const G = { id: "g2", name: "200 Gift", price: 1200, giftOnly: true };
    const promos = promotionsFromProducts([A, B, G]);

    const r = checkCanAdd({ ...G, productId: "g2" }, [cartLine(B, 2)], promos);
    assert.equal(r.ok, false);
    assert.match(r.reason, /600 B/, "should talk about the deal in progress");
    assert.equal((r.reason.match(/Not free yet/g) || []).length, 0);
  },
);

/* ---------- eight nappy sizes, any four, any trial size ---------- */

const SIZES = ["NB", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];
const NAPPY = SIZES.map((z, i) => ({
  id: `d${i}`,
  name: `Diaper ${z}`,
  price: 4500,
}));
const TRIAL = SIZES.map((z, i) => ({
  id: `t${i}`,
  name: `Trial ${z}`,
  price: 1500,
  giftOnly: true,
}));
// Configured once, on the first size, listing all eight as triggers.
NAPPY[0].giftOffer = {
  buyQty: 4,
  triggerIds: NAPPY.map((d) => d.id),
  giftGroups: [{ qty: 1, productIds: TRIAL.map((t) => t.id) }],
};
const NAPPYP = promotionsFromProducts([...NAPPY, ...TRIAL]);
const asProduct = (p) => ({ ...p, productId: p.id });

check("one promotion covers all eight sizes", () => {
  assert.equal(NAPPYP.length, 1);
  assert.equal(NAPPYP[0].require.productIds.length, 8);
  assert.match(NAPPYP[0].gifts[0].label, /any 8 sizes/);
});

check("four DIFFERENT sizes earn a trial box", () => {
  const cart = [
    cartLine(NAPPY[0], 1),
    cartLine(NAPPY[3], 1),
    cartLine(NAPPY[5], 1),
    cartLine(NAPPY[7], 1),
  ];
  assert.equal(checkCanAdd(asProduct(TRIAL[2]), cart, NAPPYP).ok, true);
});

check("the trial size need not match anything bought", () => {
  const cart = [cartLine(NAPPY[1], 4)]; // four size S
  // customer takes an XXXXL trial
  assert.equal(checkCanAdd(asProduct(TRIAL[7]), cart, NAPPYP).ok, true);
});

check("three nappies is not enough, whatever the mix", () => {
  const cart = [
    cartLine(NAPPY[0], 1),
    cartLine(NAPPY[2], 1),
    cartLine(NAPPY[6], 1),
  ];
  const r = checkCanAdd(asProduct(TRIAL[0]), cart, NAPPYP);
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 more/);
});

check("the trial box is free, the nappies are charged", () => {
  const lines = [
    cartLine(NAPPY[0], 2),
    cartLine(NAPPY[4], 2),
    cartLine(TRIAL[3], 1),
  ];
  const r = applyPromotions(lines, NAPPYP);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 4 * 4500);
});

check("eight nappies earn two trial boxes, a third is refused", () => {
  const cart8 = [cartLine(NAPPY[0], 8), cartLine(TRIAL[1], 1)];
  assert.equal(checkCanAdd(asProduct(TRIAL[5]), cart8, NAPPYP).ok, true);
  const cart8b = [
    cartLine(NAPPY[0], 8),
    cartLine(TRIAL[1], 1),
    cartLine(TRIAL[5], 1),
  ];
  assert.equal(checkCanAdd(asProduct(TRIAL[2]), cart8b, NAPPYP).ok, false);
});

check("the two free boxes may be different sizes", () => {
  const lines = [
    cartLine(NAPPY[2], 8),
    cartLine(TRIAL[0], 1),
    cartLine(TRIAL[6], 1),
  ];
  const r = applyPromotions(lines, NAPPYP);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 8 * 4500);
});

check("setting the same group on every size still gives ONE promotion", () => {
  const all = NAPPY.map((d) => ({ ...d, giftOffer: NAPPY[0].giftOffer }));
  const promos = promotionsFromProducts([...all, ...TRIAL]);
  assert.equal(
    promos.length,
    1,
    "duplicates must collapse, or four nappies give eight boxes",
  );
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
