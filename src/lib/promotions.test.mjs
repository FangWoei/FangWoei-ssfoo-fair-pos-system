import assert from "node:assert";
import {
  applyPromotions,
  checkCanAdd,
  earnedSets,
  giftLedger,
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
  assert.match(r.blockers[0].message, /Scan 1 more/);
  assert.match(r.blockers[1].message, /Scan 2 more/);
});

check("one gift short -> blocked, and it says how many more", () => {
  const lines = [c600(3), calm200(1), oat200(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0].message, /Scan 1 more/);
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

check("4 packs mixed sizes + trial box = RM160 and the trial free", () => {
  const lines = [dia("M", 2), dia("L", 2), trial(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 16000);
});

/* ---------- diaper bundles: 2 for RM70, 4 for RM160, sizes mixed ---------- */

const diaP = (size, price, q) => line(`Diaper ${size}`, price, q, ["diaper"]);

check("2 packs of DIFFERENT sizes = RM70", () => {
  const lines = [diaP("NB", 4290, 1), diaP("S", 4290, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 7000);
});

check("2 of one size = RM70 too", () => {
  const lines = [diaP("M", 4290, 2)];
  assert.equal(total(lines, applyPromotions(lines)), 7000);
});

check("1 pack alone is full price", () => {
  const lines = [diaP("NB", 4290, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 4290);
});

check("3 packs = one pair plus one at full price", () => {
  const lines = [diaP("NB", 4290, 2), diaP("S", 4290, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 7000 + 4290);
});

check("4 packs = RM160, the four-tier wins over two pairs", () => {
  // Largest bundle first, not cheapest: two pairs would be RM140, but the
  // four is the advertised deal and it carries the free trial box.
  const lines = [diaP("NB", 4290, 3), diaP("S", 4290, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 16000);
});

check("5 packs = buy 4 free 1, RM143.60", () => {
  const lines = [diaP("NB", 4290, 5)];
  assert.equal(total(lines, applyPromotions(lines)), 14360);
});

check("5 mixed sizes also RM143.60", () => {
  const lines = [
    diaP("NB", 4290, 1),
    diaP("S", 4290, 1),
    diaP("M", 4290, 1),
    diaP("L", 4290, 1),
    diaP("XL", 4290, 1),
  ];
  assert.equal(total(lines, applyPromotions(lines)), 14360);
});

check("the trial box is OFFERED, never owed — payment is not blocked", () => {
  // Pants L, XL and XXL have no trial stock. The sale must still complete.
  const lines = [diaP("L", 3590, 4)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
});

check("a trial box is still free when one IS scanned", () => {
  const lines = [diaP("NB", 4290, 4), trial(1)];
  const r = applyPromotions(lines);
  assert.equal(r.linePrices[lines[1].key], 0);
  assert.equal(total(lines, r), 16000);
});

check("6 packs = a five plus one at full price", () => {
  const lines = [diaP("NB", 4290, 3), diaP("S", 4290, 3)];
  assert.equal(total(lines, applyPromotions(lines)), 14360 + 4290);
});

check("10 packs = two fives", () => {
  const lines = [diaP("NB", 4290, 10)];
  assert.equal(total(lines, applyPromotions(lines)), 28720);
});

check("with different prices per size, the DEAREST go into the bundle", () => {
  // 2 premium at RM50, 3 basic at RM30 = RM190 retail across five packs.
  // The five-tier covers all of them for RM143.60.
  const lines = [diaP("XXL", 5000, 2), diaP("NB", 3000, 3)];
  assert.equal(total(lines, applyPromotions(lines)), 14360);
});

check("a bundle that costs the customer MORE is not applied", () => {
  // Two packs at RM30 = RM60, under the RM70 pair price.
  const lines = [diaP("NB", 3000, 2)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 6000);
  assert.equal(
    r.applied.some((a) => a.id === "diaper-bundles"),
    false,
  );
});

check("4 packs make the trial box available, without demanding it", () => {
  const lines = [diaP("NB", 4290, 4)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(checkCanAdd(P_TRIAL, lines).ok, true);
});

check("a bundle is skipped when it saves the customer nothing", () => {
  // A four-tier priced at exactly what the four packs are worth is no offer
  // at all, so it must not be applied — an offer may never be a penalty.
  const promo = {
    id: "test",
    name: "test",
    short: "test",
    type: "bundle-fixed",
    require: { tag: "diaper", qty: 2 },
    tiers: [{ qty: 4, price: 17160 }],
  };
  const lines = [diaP("NB", 4290, 4)];
  assert.equal(total(lines, applyPromotions(lines, [promo])), 17160 - 0 - 0);
  // 4 × RM42.90 = RM171.60, the same as the tier, so nothing changes.
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
});

check("THREE of one flavour: the gift barcodes unlock", () => {
  const cart = [c600(3)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, true);
  assert.equal(checkCanAdd(P_OAT200, cart).ok, true);
});

check("2 Calming + 1 Vanilla is not a set — gift stays refused", () => {
  const r = checkCanAdd(P_CALM200, [c600(2), v600(1)]);
  assert.equal(r.ok, false);
});

check("entitlement is one Calming 200ml only — a second is refused", () => {
  const cart = [c600(3), calm200(1)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, false);
});

check("entitlement is two Oat 200ml — third is refused", () => {
  assert.equal(checkCanAdd(P_OAT200, [c600(3), oat200(1)]).ok, true);
  assert.equal(checkCanAdd(P_OAT200, [c600(3), oat200(2)]).ok, false);
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

const SHAMPOO = {
  id: "sh1",
  name: "Shampoo 400ml",
  price: 2500,
  giftOffer: { buyQty: 3, giftGroups: [{ qty: 2, productIds: ["c1", "c2"] }] },
};
const COND_ORI = {
  id: "c1",
  name: "Conditioner Original",
  price: 1800,
  giftOnly: true,
};
const COND_OAT = {
  id: "c2",
  name: "Conditioner Oat",
  price: 1800,
  giftOnly: true,
};
const GIFTP = promotionsFromProducts([SHAMPOO, COND_ORI, COND_OAT]);

const cartLine = (p, qty) => ({
  key: `x${seq++}`,
  productId: p.id,
  name: p.name,
  unitPrice: p.price,
  qty,
  tags: [],
  discount: null,
});

check("3 shampoo: EITHER conditioner unlocks — customer picks", () => {
  const cart = [cartLine(SHAMPOO, 3)];
  assert.equal(
    checkCanAdd({ ...COND_ORI, productId: "c1" }, cart, GIFTP).ok,
    true,
  );
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, cart, GIFTP).ok,
    true,
  );
});

check("the 2 free may be mixed, or both the same", () => {
  const mixed = [cartLine(SHAMPOO, 3), cartLine(COND_ORI, 1)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, mixed, GIFTP).ok,
    true,
  );
  const same = [cartLine(SHAMPOO, 3), cartLine(COND_OAT, 1)];
  assert.equal(
    checkCanAdd({ ...COND_OAT, productId: "c2" }, same, GIFTP).ok,
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

check("a product with no gift offer produces no promotion", () => {
  assert.equal(promotionsFromProducts([COND_ORI, COND_OAT]).length, 0);
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

/* ---------- two shampoo promotions in ONE sale ---------- */
/* Buy 3 Original -> 1 Calming 200ml + 2 Oat 200ml.
   Buy 3 Oat      -> the same again. Both in the same basket. */

const SH_ORI = {
  id: "so",
  name: "HTT600 Original",
  price: 2690,
  giftOffer: {
    buyQty: 3,
    giftGroups: [
      { qty: 1, productIds: ["g_cal"] },
      { qty: 2, productIds: ["g_oat"] },
    ],
  },
};
const SH_OAT = {
  id: "sa",
  name: "HTT600 Oat",
  price: 2690,
  giftOffer: {
    buyQty: 3,
    giftGroups: [
      { qty: 1, productIds: ["g_cal"] },
      { qty: 2, productIds: ["g_oat"] },
    ],
  },
};
const G_CAL = {
  id: "g_cal",
  name: "HTT200 Calming",
  price: 1350,
  giftOnly: true,
};
const G_OAT = { id: "g_oat", name: "HTT200 Oat", price: 1350, giftOnly: true };
const SHP = promotionsFromProducts([SH_ORI, SH_OAT, G_CAL, G_OAT]);
const asP = (p) => ({ ...p, productId: p.id });

check("two separate 600ml promotions each earn their own gifts", () => {
  assert.equal(SHP.length, 2);
});

check("3 Original then 3 Oat: entitlement DOUBLES to 2 Calming + 4 Oat", () => {
  const cart = [cartLine(SH_ORI, 3), cartLine(SH_OAT, 3)];
  const led = giftLedger(cart, SHP);
  const cal = led.find((e) => e.gift.productIds.includes("g_cal"));
  const oat = led.find((e) => e.gift.productIds.includes("g_oat"));
  assert.equal(cal.allowed, 2);
  assert.equal(oat.allowed, 4);
});

check(
  "the second promotion CAN still claim its gifts — the old deadlock",
  () => {
    // First promotion's gifts already scanned in full.
    const cart = [cartLine(SH_ORI, 3), cartLine(G_CAL, 1), cartLine(G_OAT, 2)];
    // Customer now buys 3 Oat as well.
    cart.push(cartLine(SH_OAT, 3));
    // Both gift barcodes must open up again.
    assert.equal(checkCanAdd(asP(G_CAL), cart, SHP).ok, true);
    assert.equal(checkCanAdd(asP(G_OAT), cart, SHP).ok, true);
  },
);

check("all six free bottles ring at zero, and nothing blocks payment", () => {
  const lines = [
    cartLine(SH_ORI, 3),
    cartLine(SH_OAT, 3),
    cartLine(G_CAL, 2),
    cartLine(G_OAT, 4),
  ];
  const r = applyPromotions(lines, SHP);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(r.linePrices[lines[2].key], 0);
  assert.equal(r.linePrices[lines[3].key], 0);
  assert.equal(total(lines, r), 6 * 2690);
});

check("a seventh free bottle is still refused", () => {
  const cart = [
    cartLine(SH_ORI, 3),
    cartLine(SH_OAT, 3),
    cartLine(G_CAL, 2),
    cartLine(G_OAT, 4),
  ];
  assert.equal(checkCanAdd(asP(G_OAT), cart, SHP).ok, false);
});

check("gifts are counted once, not once per promotion", () => {
  const lines = [
    cartLine(SH_ORI, 3),
    cartLine(SH_OAT, 3),
    cartLine(G_CAL, 2),
    cartLine(G_OAT, 4),
  ];
  const r = applyPromotions(lines, SHP);
  const giftSaving = r.applied
    .filter((a) => a.id.startsWith("gift-"))
    .reduce((sum, a) => sum + a.saving, 0);
  assert.equal(giftSaving, 2 * 1350 + 4 * 1350);
});

/* ---------- pants L/XL/XXL: no trial box, so buy 4 free 1 instead ---------- */

const pants = (size, q, price = 3590) =>
  line(`Pants ${size}`, price, q, ["diaperpants"]);

check("4 packs: nothing free yet", () => {
  const lines = [pants("L", 4)];
  assert.equal(total(lines, applyPromotions(lines)), 4 * 3590);
});

check("5 packs = RM143.60 — four paid, one free", () => {
  const lines = [pants("L", 5)];
  assert.equal(total(lines, applyPromotions(lines)), 14360);
});

check("sizes mix: 2L + 2XL + 1XXL still gives one free", () => {
  const lines = [pants("L", 2), pants("XL", 2), pants("XXL", 1)];
  assert.equal(total(lines, applyPromotions(lines)), 14360);
});

check("10 packs = two free", () => {
  const lines = [pants("L", 10)];
  assert.equal(total(lines, applyPromotions(lines)), 8 * 3590);
});

check("where prices differ, the CHEAPEST pack is the free one", () => {
  const lines = [pants("L", 4, 3590), pants("XL", 1, 3990)];
  // free = one at RM35.90, so pay 3×35.90 + 39.90
  assert.equal(total(lines, applyPromotions(lines)), 3 * 3590 + 3990);
});

check("pants never earn a trial box, and never block payment", () => {
  const lines = [pants("L", 5)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
});

check("pants are not part of the RM70 / RM160 diaper bundles", () => {
  const lines = [pants("L", 2)];
  const r = applyPromotions(lines);
  assert.equal(
    r.applied.some((a) => a.id === "diaper-bundles"),
    false,
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
