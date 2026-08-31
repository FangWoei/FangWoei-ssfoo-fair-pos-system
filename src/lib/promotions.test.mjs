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
const c600 = (q) => line("BB HTT600 CALMING - WTP", 2690, q, []);
const o600 = (q) => line("BB HTT600 OAT - WTP", 2690, q, []);
const v600 = (q) => line("BB HTT600 CV - WTP", 2690, q, []);
const calm200 = (q) => line("BB HTT200 CALMING", 1350, q, []);
const oat200 = (q) => line("BB HTT200 OAT", 1350, q, []);

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
  "2 Calming + 1 Oat 600ml + the three gifts = RM75, nothing blocked",
  () => {
    const lines = [c600(2), o600(1), calm200(1), oat200(2)];
    const r = applyPromotions(lines);
    assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
    assert.equal(total(lines, r), 7500);
    assert.equal(r.applied[0].id, "h2t600-trio");
  },
);

check("gifts missing entirely -> payment blocked, both gifts named", () => {
  const lines = [c600(2), o600(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 2);
  assert.match(r.blockers[0].message, /Scan 1 more/);
  assert.match(r.blockers[1].message, /Scan 2 more/);
});

check("one gift short -> blocked, and it says how many more", () => {
  const lines = [c600(2), o600(1), calm200(1), oat200(1)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0].message, /Scan 1 more/);
});

check("only 2 bottles -> no promo, full price, no blocker", () => {
  const lines = [c600(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(r.applied.length, 0);
  assert.equal(total(lines, r), 2 * 2690);
});

check("a mixed three without Oat is not a set: 2 calming + 1 CV", () => {
  const lines = [c600(2), v600(1)];
  const r = applyPromotions(lines);
  assert.equal(total(lines, r), 3 * 2690);
});

check("six bottles with three Oat = two sets and doubled gifts", () => {
  const lines = [c600(3), o600(3), calm200(2), oat200(4)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0, JSON.stringify(r.blockers));
  assert.equal(total(lines, r), 15000); // 2 × RM75
});

check("6 bottles with 2 Oat = 2 sets, needs double gifts", () => {
  const lines = [c600(4), o600(2), calm200(1), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 2); // 1 more calming, 2 more oat
});

check("4th bottle is charged normally on top of the set", () => {
  const lines = [c600(3), o600(1), calm200(1), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(total(lines, r), 7500 + 2690);
});

check("a 200ml bought beyond the free entitlement is charged", () => {
  const lines = [c600(2), o600(1), calm200(2), oat200(2)];
  const r = applyPromotions(lines);
  assert.equal(r.blockers.length, 0);
  assert.equal(total(lines, r), 7500 + 1350); // second calming is a normal sale
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

/* ---------- diapers: buy 2, free 1, sizes mixed ---------- */

const diaP = (size, price, q) => line(`Diaper ${size}`, price, q, ["diaper"]);
const D = 4250; // RM42.50 each

check("1 pack is full price", () => {
  const lines = [diaP("NB", D, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 4250);
});

check("2 packs is full price — nothing free yet", () => {
  const lines = [diaP("NB", D, 2)];
  assert.equal(total(lines, applyPromotions(lines)), 8500);
});

check("3 packs = RM85.00, the third is free", () => {
  const lines = [diaP("NB", D, 3)];
  assert.equal(total(lines, applyPromotions(lines)), 8500);
});

check("3 DIFFERENT sizes also RM85.00", () => {
  const lines = [diaP("NB", D, 1), diaP("S", D, 1), diaP("M", D, 1)];
  assert.equal(total(lines, applyPromotions(lines)), 8500);
});

check("4 packs = pay for 3", () => {
  const lines = [diaP("NB", D, 4)];
  assert.equal(total(lines, applyPromotions(lines)), 12750);
});

check("6 packs = pay for 4", () => {
  const lines = [diaP("NB", D, 2), diaP("S", D, 2), diaP("L", D, 2)];
  assert.equal(total(lines, applyPromotions(lines)), 17000);
});

check("9 packs = pay for 6", () => {
  const lines = [diaP("NB", D, 9)];
  assert.equal(total(lines, applyPromotions(lines)), 25500);
});

check(
  "where sizes differ in price, the CHEAPEST of the three goes free",
  () => {
    const lines = [diaP("XXL", 5000, 2), diaP("NB", 3000, 1)];
    assert.equal(total(lines, applyPromotions(lines)), 10000);
  },
);

check("nothing blocks payment — no trial box in this plan", () => {
  const lines = [diaP("NB", D, 4)];
  assert.equal(applyPromotions(lines).blockers.length, 0);
});

/* ---------- the scan gate: gift barcodes refused until earned ---------- */

const prod = (name, price, tags) => ({ name, unitPrice: price, tags });
const P_CALM200 = { ...prod("BB HTT200 CALMING", 1350, []), giftOnly: true };
const P_OAT200 = { ...prod("BB HTT200 OAT", 1350, []), giftOnly: true };
const P_TRIAL = {
  ...prod("Diaper trial box M", 1500, ["diapertrial"]),
  giftOnly: true,
};
const P_600 = prod("BB HTT600 CALMING - WTP", 2690, []);

check("empty cart: the free 200ml barcode is refused", () => {
  const r = checkCanAdd(P_CALM200, []);
  assert.equal(r.ok, false);
});

check("three bottles including an Oat: the gift barcodes unlock", () => {
  const cart = [c600(2), o600(1)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, true);
  assert.equal(checkCanAdd(P_OAT200, cart).ok, true);
});

check("2 Calming + 1 CV has no Oat — gift stays refused", () => {
  const r = checkCanAdd(P_CALM200, [c600(2), v600(1)]);
  assert.equal(r.ok, false);
});

check("3 Calming DOES unlock the gifts — same flavour needs no Oat", () => {
  assert.equal(checkCanAdd(P_CALM200, [c600(3)]).ok, true);
  assert.equal(checkCanAdd(P_OAT200, [c600(3)]).ok, true);
});

check("entitlement is one Calming 200ml only — a second is refused", () => {
  const cart = [c600(2), o600(1), calm200(1)];
  assert.equal(checkCanAdd(P_CALM200, cart).ok, false);
});

check("entitlement is two Oat 200ml — third is refused", () => {
  assert.equal(checkCanAdd(P_OAT200, [c600(2), o600(1), oat200(1)]).ok, true);
  assert.equal(checkCanAdd(P_OAT200, [c600(2), o600(1), oat200(2)]).ok, false);
});

check("a normal product is never gated", () => {
  assert.equal(checkCanAdd(P_600, []).ok, true);
  assert.equal(checkCanAdd(prod("Kopi O", 400, []), []).ok, true);
});

check("three of ONE flavour always qualifies, Oat or not", () => {
  assert.equal(earnedSets(PROMOTIONS[0], [c600(3)]), 1, "3 Calming");
  assert.equal(earnedSets(PROMOTIONS[0], [v600(3)]), 1, "3 CV");
  assert.equal(earnedSets(PROMOTIONS[0], [o600(3)]), 1, "3 Oat");
});

check("a MIXED three only qualifies with an Oat in it", () => {
  assert.equal(earnedSets(PROMOTIONS[0], [c600(2), o600(1)]), 1);
  assert.equal(earnedSets(PROMOTIONS[0], [c600(1), v600(1), o600(1)]), 1);
  assert.equal(
    earnedSets(PROMOTIONS[0], [c600(2), v600(1)]),
    0,
    "mixed, no Oat",
  );
  assert.equal(
    earnedSets(PROMOTIONS[0], [c600(1), v600(2)]),
    0,
    "mixed, no Oat",
  );
});

check("a mixed three without Oat is charged at full price", () => {
  const lines = [c600(2), v600(1)];
  assert.equal(total(lines, applyPromotions(lines)), 3 * 2690);
});

check("same-flavour sets are taken before mixed ones", () => {
  // 3 Calming + 3 CV is two same-flavour sets and needs no Oat at all.
  assert.equal(earnedSets(PROMOTIONS[0], [c600(3), v600(3)]), 2);
  // 4 Calming + 1 CV + 1 Oat: one same set, then a mix around the Oat.
  assert.equal(earnedSets(PROMOTIONS[0], [c600(4), v600(1), o600(1)]), 2);
});

check("5 of one flavour = one set plus two at full price", () => {
  const lines = [c600(5)];
  assert.equal(total(lines, applyPromotions(lines)), 7500 + 2 * 2690);
});

check("the refusal explains the Oat condition on a mixed three", () => {
  const r = checkCanAdd(P_OAT200, [c600(2), v600(1)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /OAT - WTP/i);
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
