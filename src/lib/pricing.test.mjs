import assert from 'node:assert';
import { priceLine, formatRM, bestBulkCombo } from './pricing.js';

const cases = [];
const check = (name, fn) => cases.push([name, fn]);

const freebie = (buyQty, freeQty) => ({ type: 'freebie', buyQty, freeQty });
const bulk = (...pairs) => ({
  type: 'bulk',
  tiers: pairs.map(([qty, price]) => ({ qty, price })),
});

/* --- Buy X free Y: buy 12 free 1 at RM10 --- */
check('24 scans = RM230', () => {
  const r = priceLine({ unitPrice: 1000, qty: 24, offer: freebie(12, 1) });
  assert.equal(r.total, 23000, formatRM(r.total));
  assert.equal(r.freeQty, 1);
});

check('26 scans = RM240', () => {
  const r = priceLine({ unitPrice: 1000, qty: 26, offer: freebie(12, 1) });
  assert.equal(r.total, 24000, formatRM(r.total));
  assert.equal(r.freeQty, 2);
});

check('13 scans = RM120 (first complete group)', () => {
  const r = priceLine({ unitPrice: 1000, qty: 13, offer: freebie(12, 1) });
  assert.equal(r.total, 12000, formatRM(r.total));
});

check('12 scans = RM120 (group not complete yet)', () => {
  const r = priceLine({ unitPrice: 1000, qty: 12, offer: freebie(12, 1) });
  assert.equal(r.total, 12000, formatRM(r.total));
  assert.equal(r.freeQty, 0);
});

/* --- Bulk: 1 for RM10, 2 for RM18 --- */
check('5 items become 2+2+1 = RM46', () => {
  const r = priceLine({ unitPrice: 1000, qty: 5, offer: bulk([2, 1800]) });
  assert.equal(r.total, 4600, formatRM(r.total));
  assert.deepEqual(
    r.parts.map((p) => [p.qty, p.times]),
    [[2, 2], [1, 1]]
  );
});

/* --- Bulk, the non-naive case: 3 for RM27 and 5 for RM40 --- */
check('6 items price as 5+1 = RM50, not 3+3 = RM54', () => {
  const r = priceLine({
    unitPrice: 1000,
    qty: 6,
    offer: bulk([3, 2700], [5, 4000]),
  });
  assert.equal(r.total, 5000, formatRM(r.total));
  assert.deepEqual(
    r.parts.map((p) => [p.qty, p.times]),
    [[5, 1], [1, 1]]
  );
});

check('11 items with 3@27 + 5@40 = 5+5+1 = RM90', () => {
  const r = priceLine({
    unitPrice: 1000,
    qty: 11,
    offer: bulk([3, 2700], [5, 4000]),
  });
  assert.equal(r.total, 9000, formatRM(r.total));
});

check('a bad-value tier is simply never used', () => {
  const r = priceLine({ unitPrice: 1000, qty: 4, offer: bulk([2, 2500]) });
  assert.equal(r.total, 4000, formatRM(r.total));
  assert.equal(r.saved, 0);
});

check('upsell hint when buying more is genuinely cheaper', () => {
  // 4 units at RM10 = RM40, but 5 for RM35.
  const r = bestBulkCombo(4, 1000, [{ qty: 5, price: 3500 }]);
  assert.equal(r.total, 4000);
  assert.equal(r.upsell.qty, 5);
  assert.equal(r.upsell.saves, 500);
});

/* --- Manual discount overrides the offer, never stacks --- */
check('percent discount replaces bulk pricing', () => {
  const r = priceLine({
    unitPrice: 1000,
    qty: 5,
    offer: bulk([2, 1800]),
    discount: { type: 'percent', value: 10 },
  });
  assert.equal(r.total, 4500, formatRM(r.total)); // 10% off RM50, not off RM46
  assert.equal(r.rule, 'discount');
});

check('amount discount replaces freebie', () => {
  const r = priceLine({
    unitPrice: 1000,
    qty: 26,
    offer: freebie(12, 1),
    discount: { type: 'amount', value: 500 },
  });
  assert.equal(r.total, 25500, formatRM(r.total)); // RM260 - RM5
  assert.equal(r.freeQty, 0);
});

check('discount cannot push a line below zero', () => {
  const r = priceLine({
    unitPrice: 1000,
    qty: 2,
    discount: { type: 'amount', value: 999999 },
  });
  assert.equal(r.total, 0);
});

/* --- odds and ends --- */
check('sen rounding on odd percentages', () => {
  const r = priceLine({
    unitPrice: 333,
    qty: 7,
    discount: { type: 'percent', value: 15 },
  });
  assert.equal(r.gross, 2331);
  assert.equal(r.total, 2331 - 350);
});

check('formatRM', () => {
  assert.equal(formatRM(0), 'RM0.00');
  assert.equal(formatRM(5), 'RM0.05');
  assert.equal(formatRM(23000), 'RM230.00');
  assert.equal(formatRM(-250), '-RM2.50');
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
