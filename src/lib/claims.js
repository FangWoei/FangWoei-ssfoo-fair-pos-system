import { PROMOTIONS } from "./promotions.js";

/**
 * The buy-4-free-1 claim.
 *
 * The company reimburses the free diaper, so they need every sale that gave
 * one away — with enough detail to check it. That means the whole sale, not
 * just the diaper lines: a customer paying for shampoo and diapers together is
 * one transaction and one receipt, and a claim showing only part of it invites
 * questions.
 *
 * Works off recorded sales rather than live cart state, so it can be run at
 * any time for any period, including after the fair.
 */

const RULE = PROMOTIONS.find((p) => p.id === "diaper-4-free-1");
export const SET_SIZE = RULE?.require?.qty ?? 5;
export const BUNDLE_PRICE = RULE?.price ?? 14360;
export const FREE_PER_SET = 1;

/** Is this sale line a diaper? Tags first, product name as a fallback. */
function isDiaper(item, tagsById) {
  const tags = tagsById.get(item.productId);
  if (tags?.length) return tags.includes("diaper");
  // Sales recorded before a product was tagged, or a product since deleted.
  return /diaper/i.test(item.name || "");
}

/**
 * @param {Array} sales     as stored, newest first
 * @param {Array} products  current catalogue, for tags
 * @param {Date}  from      only sales at or after this moment
 */
export function diaperClaim(sales, products = [], from = null) {
  const tagsById = new Map(
    products.map((p) => [
      p.id,
      (p.tags || []).map((t) => String(t).toLowerCase()),
    ]),
  );

  const rows = [];
  let totalFree = 0;
  let totalSets = 0;
  let totalDiapers = 0;
  let diaperTakings = 0;
  let saleTakings = 0;

  for (const sale of sales) {
    const at = sale.localAt?.toDate
      ? sale.localAt.toDate()
      : new Date(sale.localAt || 0);
    if (from && at < from) continue;

    const diapers = (sale.items || []).filter((i) => isDiaper(i, tagsById));
    if (!diapers.length) continue;

    const qty = diapers.reduce((s, i) => s + (i.qty || 0), 0);
    const sets = Math.floor(qty / SET_SIZE);
    if (!sets) continue; // no free diaper given, nothing to claim

    const free = sets * FREE_PER_SET;
    const diaperTotal = diapers.reduce((s, i) => s + (i.total || 0), 0);
    const others = (sale.items || []).filter((i) => !isDiaper(i, tagsById));

    rows.push({
      receiptNo: sale.receiptNo || "",
      at,
      till: sale.till || "",
      cashier: sale.cashierName || "",
      method: sale.method,
      diapers,
      diaperQty: qty,
      sets,
      free,
      diaperTotal,
      others,
      otherQty: others.reduce((s, i) => s + (i.qty || 0), 0),
      otherTotal: others.reduce((s, i) => s + (i.total || 0), 0),
      saleTotal: sale.total || 0,
    });

    totalFree += free;
    totalSets += sets;
    totalDiapers += qty;
    diaperTakings += diaperTotal;
    saleTakings += sale.total || 0;
  }

  // Oldest first: a claim reads as a run of transactions in order.
  rows.sort((a, b) => a.at - b.at);

  /* How many of each size went out free is the number the company will want,
     and it cannot be taken from the lines directly — the free pack is not a
     line of its own, it is a discount spread across the bundle. Attribute it
     to the sizes actually bought, largest quantity first. */
  const freeBySize = {};
  for (const row of rows) {
    let left = row.free;
    const bySize = [...row.diapers].sort((a, b) => (b.qty || 0) - (a.qty || 0));
    for (const item of bySize) {
      if (left <= 0) break;
      const take = Math.min(left, item.qty || 0);
      freeBySize[item.name] = (freeBySize[item.name] || 0) + take;
      left -= take;
    }
  }

  return {
    rows,
    totals: {
      sales: rows.length,
      sets: totalSets,
      free: totalFree,
      diapers: totalDiapers,
      diaperTakings,
      saleTakings,
    },
    freeBySize: Object.entries(freeBySize).sort((a, b) => b[1] - a[1]),
  };
}
