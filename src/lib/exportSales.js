import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx-js-style";
import { SHOP } from "../components/Receipt";
import { METHODS, TILLS } from "./db";

/**
 * Exporting the takings.
 *
 * Two rules run through all of this.
 *
 * Money is written as a NUMBER, never the string "RM42.90". The first thing
 * anyone does with a sales export is select a column and look at the sum, and
 * a column of text sums to nothing. Sen are divided down to ringgit and the
 * cell carries an "RM"#,##0.00 format, so it reads as money and still adds up.
 *
 * Discounts are NEGATIVE, so a discount column also sums to the right answer
 * rather than needing to be subtracted by hand.
 */

const rm = (sen) => Math.round(Number(sen) || 0) / 100;
const MONEY = '"RM"#,##0.00';

const INK = "14171F";
const ROSE = "E5195F";
const GREEN = "0E8A4F";
const AMBER = "D97400";
const BLUE = "1B6FE0";
const PAPER = "F5F7FA";
const RULE = "D8DEE8";

const when = (s) =>
  s.localAt?.toDate ? s.localAt.toDate() : new Date(s.localAt || Date.now());
const dateStr = (d) =>
  d.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const timeStr = (d) =>
  d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}`;
};

export function summarise(sales) {
  const byMethod = {};
  const countByMethod = {};
  const byTill = {};
  const byCashier = {};
  const byProduct = {};
  const byHour = {};
  let total = 0;
  let gross = 0;
  let saved = 0;
  let units = 0;
  let unverified = 0;

  for (const s of sales) {
    total += s.total || 0;
    gross += s.gross || 0;
    saved += s.saved || 0;
    units += s.qty || 0;
    if (s.method !== "cash" && s.verified === false) unverified++;

    byMethod[s.method] = (byMethod[s.method] || 0) + (s.total || 0);
    countByMethod[s.method] = (countByMethod[s.method] || 0) + 1;

    const t = s.till || "unknown";
    byTill[t] = byTill[t] || { count: 0, total: 0, cash: 0, qr: 0, card: 0 };
    byTill[t].count++;
    byTill[t].total += s.total || 0;
    byTill[t][s.method] = (byTill[t][s.method] || 0) + (s.total || 0);

    const c = s.cashierName || "—";
    byCashier[c] = byCashier[c] || { count: 0, total: 0 };
    byCashier[c].count++;
    byCashier[c].total += s.total || 0;

    const h = when(s).getHours();
    byHour[h] = byHour[h] || { count: 0, total: 0 };
    byHour[h].count++;
    byHour[h].total += s.total || 0;

    for (const it of s.items || []) {
      const e = (byProduct[it.name] ||= { qty: 0, total: 0, saved: 0 });
      e.qty += it.qty || 0;
      e.total += it.total || 0;
      e.saved += it.saved || 0;
    }
  }

  return {
    sales: sales.length,
    units,
    gross,
    saved,
    total,
    average: sales.length ? Math.round(total / sales.length) : 0,
    byMethod,
    countByMethod,
    byTill,
    byCashier,
    byHour,
    unverified,
    products: Object.entries(byProduct).sort((a, b) => b[1].total - a[1].total),
  };
}

/* ================================ EXCEL ================================ */

const font = (o = {}) => ({
  name: "Calibri",
  sz: 11,
  color: { rgb: INK },
  ...o,
});
const fill = (rgb) => ({ patternType: "solid", fgColor: { rgb } });
const thin = { style: "thin", color: { rgb: RULE } };
const border = (o = {}) => ({
  top: thin,
  bottom: thin,
  left: thin,
  right: thin,
  ...o,
});
const topRule = {
  top: { style: "medium", color: { rgb: INK } },
  bottom: thin,
  left: thin,
  right: thin,
};

const S = {
  title: {
    font: font({ sz: 20, bold: true }),
    alignment: { vertical: "center" },
  },
  sub: { font: font({ sz: 10, color: { rgb: "6B7387" } }) },
  section: {
    font: font({ sz: 11, bold: true, color: { rgb: "FFFFFF" } }),
    fill: fill(INK),
    alignment: { vertical: "center" },
  },
  head: (bg) => ({
    font: font({ sz: 10, bold: true, color: { rgb: "FFFFFF" } }),
    fill: fill(bg),
    alignment: { vertical: "center", wrapText: true },
    border: border(),
  }),
  cell: { font: font(), border: border() },
  num: { font: font(), alignment: { horizontal: "right" }, border: border() },
  numBold: {
    font: font({ bold: true }),
    alignment: { horizontal: "right" },
    border: border(),
  },
  money: {
    font: font(),
    numFmt: MONEY,
    alignment: { horizontal: "right" },
    border: border(),
  },
  moneyBold: {
    font: font({ bold: true }),
    numFmt: MONEY,
    alignment: { horizontal: "right" },
    border: border(),
  },
  pct: {
    font: font(),
    numFmt: "0.0%",
    alignment: { horizontal: "right" },
    border: border(),
  },
  label: { font: font(), border: border() },
  labelBold: { font: font({ bold: true }), border: border() },
  bigLabel: { font: font({ sz: 12, bold: true }), border: topRule },
  bigNum: {
    font: font({ sz: 12, bold: true }),
    alignment: { horizontal: "right" },
    border: topRule,
  },
  bigMoney: {
    font: font({ sz: 14, bold: true, color: { rgb: GREEN } }),
    numFmt: MONEY,
    alignment: { horizontal: "right" },
    border: topRule,
  },
  warn: {
    font: font({ bold: true, color: { rgb: "C4104F" } }),
    fill: fill("FFF0F5"),
    alignment: { horizontal: "right" },
    border: border(),
  },
  ok: {
    font: font({ color: { rgb: GREEN } }),
    alignment: { horizontal: "right" },
    border: border(),
  },
  z: { font: font(), fill: fill(PAPER), border: border() },
  zNum: {
    font: font(),
    fill: fill(PAPER),
    alignment: { horizontal: "right" },
    border: border(),
  },
  zMoney: {
    font: font(),
    fill: fill(PAPER),
    numFmt: MONEY,
    alignment: { horizontal: "right" },
    border: border(),
  },
  zPct: {
    font: font(),
    fill: fill(PAPER),
    numFmt: "0.0%",
    alignment: { horizontal: "right" },
    border: border(),
  },
};

/** Writes a row of [value, style] pairs at row `r`; returns the next row. */
function put(ws, r, cells) {
  cells.forEach((c, i) => {
    if (c === null || c === undefined) return;
    const [v, style] = Array.isArray(c) ? c : [c, S.cell];
    ws[XLSX.utils.encode_cell({ r, c: i })] = {
      t: typeof v === "number" ? "n" : "s",
      v,
      s: style,
    };
  });
  return r + 1;
}

function seal(ws, rows, cols, merges) {
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows, c: cols - 1 },
  });
  ws["!merges"] = merges;
}

function masthead(ws, scopeLabel, sheetName, width) {
  const merges = [];
  let r = 0;
  const span = () =>
    merges.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: width - 1 } });
  r = put(ws, r, [[SHOP.name, S.title]]);
  span();
  r = put(ws, r, [[(SHOP.lines || []).join("  ·  "), S.sub]]);
  span();
  r = put(ws, r, [
    [
      `${sheetName} — ${scopeLabel}     generated ${dateStr(new Date())} ${timeStr(new Date())}`,
      S.sub,
    ],
  ]);
  span();
  return [r + 1, merges];
}

function band(ws, r, text, width, merges) {
  const cells = Array.from({ length: width }, (_, i) => [
    i === 0 ? text : "",
    S.section,
  ]);
  const next = put(ws, r, cells);
  merges.push({ s: { r, c: 0 }, e: { r, c: width - 1 } });
  return next;
}

export function exportExcel(sales, scopeLabel) {
  const s = summarise(sales);
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `${SHOP.name} sales — ${scopeLabel}`, Author: SHOP.name };

  /* ---------------- Sheet 1: Summary ---------------- */
  {
    const W = 4;
    const ws = {};
    let [r, merges] = masthead(ws, scopeLabel, "Sales summary", W);

    r = band(ws, r, "TAKINGS", W, merges);
    r = put(ws, r, [
      ["Sales", S.label],
      [s.sales, S.num],
    ]);
    r = put(ws, r, [
      ["Items sold", S.label],
      [s.units, S.num],
    ]);
    r = put(ws, r, [
      ["Average sale", S.label],
      [rm(s.average), S.money],
    ]);
    r = put(ws, r, [
      ["Before offers", S.label],
      [rm(s.gross), S.money],
    ]);
    r = put(ws, r, [
      ["Given away in offers", S.label],
      [-rm(s.saved), S.money],
    ]);
    r = put(ws, r, [
      ["TOTAL TAKEN", S.bigLabel],
      [rm(s.total), S.bigMoney],
    ]);
    r++;

    r = band(ws, r, "BY PAYMENT METHOD", W, merges);
    r = put(ws, r, [
      ["Method", S.head(ROSE)],
      ["Sales", S.head(ROSE)],
      ["Amount", S.head(ROSE)],
      ["Share", S.head(ROSE)],
    ]);
    Object.keys(METHODS)
      .filter((m) => s.countByMethod[m])
      .forEach((m, i) => {
        const z = i % 2 === 1;
        r = put(ws, r, [
          [METHODS[m].label, z ? S.z : S.cell],
          [s.countByMethod[m], z ? S.zNum : S.num],
          [rm(s.byMethod[m]), z ? S.zMoney : S.money],
          [s.total ? s.byMethod[m] / s.total : 0, z ? S.zPct : S.pct],
        ]);
      });
    r = put(ws, r, [
      ["Total", S.labelBold],
      [s.sales, S.numBold],
      [rm(s.total), S.moneyBold],
    ]);
    r++;

    r = band(ws, r, "BY TILL — each row reconciles on its own", W, merges);
    r = put(ws, r, [
      ["Till", S.head(AMBER)],
      ["Cash box", S.head(AMBER)],
      ["DuitNow QR", S.head(AMBER)],
      ["Card", S.head(AMBER)],
    ]);
    Object.entries(s.byTill).forEach(([t, v], i) => {
      const z = i % 2 === 1;
      r = put(ws, r, [
        [TILLS[t]?.name || t, z ? S.z : S.cell],
        [rm(v.cash), z ? S.zMoney : S.money],
        [rm(v.qr), z ? S.zMoney : S.money],
        [rm(v.card), z ? S.zMoney : S.money],
      ]);
    });
    r++;

    r = band(ws, r, "BY CASHIER", W, merges);
    r = put(ws, r, [
      ["Cashier", S.head(BLUE)],
      ["Sales", S.head(BLUE)],
      ["Amount", S.head(BLUE)],
    ]);
    Object.entries(s.byCashier)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([n, v], i) => {
        const z = i % 2 === 1;
        r = put(ws, r, [
          [n, z ? S.z : S.cell],
          [v.count, z ? S.zNum : S.num],
          [rm(v.total), z ? S.zMoney : S.money],
        ]);
      });
    r++;

    r = band(ws, r, "BUSIEST HOURS", W, merges);
    r = put(ws, r, [
      ["Hour", S.head(GREEN)],
      ["Sales", S.head(GREEN)],
      ["Amount", S.head(GREEN)],
    ]);
    Object.entries(s.byHour)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([h, v], i) => {
        const z = i % 2 === 1;
        const hh = String(h).padStart(2, "0");
        const nn = String(Number(h) + 1).padStart(2, "0");
        r = put(ws, r, [
          [`${hh}:00 – ${nn}:00`, z ? S.z : S.cell],
          [v.count, z ? S.zNum : S.num],
          [rm(v.total), z ? S.zMoney : S.money],
        ]);
      });
    r++;

    r = band(ws, r, "CHECKS", W, merges);
    r = put(ws, r, [
      ["QR or card sales with no reference", S.label],
      [s.unverified, s.unverified > 0 ? S.warn : S.ok],
    ]);
    r = put(ws, r, [
      [
        s.unverified > 0
          ? "Chase these before the day is over — they are the hardest to trace later."
          : "Every QR and card sale has a reference recorded.",
        S.sub,
      ],
    ]);
    merges.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: W - 1 } });

    seal(ws, r, W, merges);
    // Column B carries the 14pt TOTAL TAKEN figure; too narrow and Excel
    // shows ### instead of the number, which is a terrible thing to hand a
    // shopkeeper at closing time.
    ws["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 17 }, { wch: 17 }];
    ws["!rows"] = [{ hpt: 27 }];
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
  }

  /* ---------------- Sheet 2: every sale ---------------- */
  {
    const W = 14;
    const ws = {};
    let [r, merges] = masthead(ws, scopeLabel, "Every sale", W);
    const headRow = r;
    r = put(
      ws,
      r,
      [
        "Receipt",
        "Date",
        "Time",
        "Till",
        "Cashier",
        "Paid by",
        "Reference",
        "Verified",
        "Items",
        "Before offers",
        "Discount",
        "Total",
        "Cash given",
        "Change",
      ].map((c) => [c, S.head(INK)]),
    );

    sales.forEach((sale, i) => {
      const d = when(sale);
      const z = i % 2 === 1;
      const c = z ? S.z : S.cell;
      const n = z ? S.zNum : S.num;
      const m = z ? S.zMoney : S.money;
      const isCash = sale.method === "cash";
      r = put(ws, r, [
        [sale.receiptNo || "", c],
        [dateStr(d), c],
        [timeStr(d), c],
        [TILLS[sale.till]?.name || sale.till || "", c],
        [sale.cashierName || "", c],
        [METHODS[sale.method]?.label || sale.method, c],
        [sale.ref || "", c],
        [
          isCash ? "n/a" : sale.verified === false ? "NO" : "yes",
          !isCash && sale.verified === false ? S.warn : c,
        ],
        [sale.qty || 0, n],
        [rm(sale.gross), m],
        [-rm(sale.saved), m],
        [
          rm(sale.total),
          z ? { ...S.zMoney, font: font({ bold: true }) } : S.moneyBold,
        ],
        [isCash ? rm(sale.cashGiven) : "", m],
        [isCash ? rm(sale.change) : "", m],
      ]);
    });

    /* A blank row before the totals. Without it, Ctrl+Shift+Down or a click on
       the column letter sweeps the total in with the data and every figure
       comes out doubled — the classic way a sales export gets misread. */
    const lastDataRow = r - 1;
    r++;
    r = put(ws, r, [
      ["TOTAL", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      ["", S.bigLabel],
      [s.units, S.bigNum],
      [rm(s.gross), S.bigMoney],
      [-rm(s.saved), S.bigMoney],
      [rm(s.total), S.bigMoney],
      ["", S.bigLabel],
      ["", S.bigLabel],
    ]);

    seal(ws, r, W, merges);
    ws["!cols"] = [
      { wch: 11 },
      { wch: 13 },
      { wch: 8 },
      { wch: 14 },
      { wch: 15 },
      { wch: 13 },
      { wch: 18 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
      { wch: 12 },
      { wch: 13 },
      { wch: 13 },
      { wch: 11 },
    ];
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headRow, c: 0 },
        e: { r: lastDataRow, c: W - 1 },
      }),
    };
    ws["!freeze"] = { xSplit: 0, ySplit: headRow + 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
  }

  /* ---------------- Sheet 3: products ---------------- */
  {
    const W = 5;
    const ws = {};
    let [r, merges] = masthead(ws, scopeLabel, "Products sold", W);
    const headRow = r;
    r = put(ws, r, [
      ["Product", S.head(GREEN)],
      ["Units sold", S.head(GREEN)],
      ["Given away", S.head(GREEN)],
      ["Takings", S.head(GREEN)],
      ["Share of takings", S.head(GREEN)],
    ]);
    s.products.forEach(([name, v], i) => {
      const z = i % 2 === 1;
      r = put(ws, r, [
        [name, z ? S.z : S.cell],
        [v.qty, z ? S.zNum : S.num],
        [v.saved ? -rm(v.saved) : 0, z ? S.zMoney : S.money],
        [rm(v.total), z ? S.zMoney : S.money],
        [s.total ? v.total / s.total : 0, z ? S.zPct : S.pct],
      ]);
    });
    const lastProductRow = r - 1;
    r++;
    r = put(ws, r, [
      ["TOTAL", S.bigLabel],
      [s.units, S.bigNum],
      [-rm(s.saved), S.bigMoney],
      [rm(s.total), S.bigMoney],
      ["", S.bigLabel],
    ]);
    seal(ws, r, W, merges);
    ws["!cols"] = [
      { wch: 46 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 17 },
    ];
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headRow, c: 0 },
        e: { r: lastProductRow, c: W - 1 },
      }),
    };
    ws["!freeze"] = { xSplit: 0, ySplit: headRow + 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Products");
  }

  /* ---------------- Sheet 4: line items ---------------- */
  {
    const W = 9;
    const ws = {};
    let [r, merges] = masthead(ws, scopeLabel, "Line items", W);
    const headRow = r;
    r = put(ws, r, [
      ["Receipt", S.head(BLUE)],
      ["Date", S.head(BLUE)],
      ["Time", S.head(BLUE)],
      ["Product", S.head(BLUE)],
      ["Qty", S.head(BLUE)],
      ["Unit price", S.head(BLUE)],
      ["Offer applied", S.head(BLUE)],
      ["Discount", S.head(BLUE)],
      ["Line total", S.head(BLUE)],
    ]);
    let i = 0;
    for (const sale of sales) {
      const d = when(sale);
      for (const it of sale.items || []) {
        const z = i++ % 2 === 1;
        const offerStyle = z
          ? { ...S.z, font: font({ color: { rgb: GREEN } }) }
          : { ...S.cell, font: font({ color: { rgb: GREEN } }) };
        r = put(ws, r, [
          [sale.receiptNo || "", z ? S.z : S.cell],
          [dateStr(d), z ? S.z : S.cell],
          [timeStr(d), z ? S.z : S.cell],
          [it.name, z ? S.z : S.cell],
          [it.qty, z ? S.zNum : S.num],
          [rm(it.unitPrice), z ? S.zMoney : S.money],
          [it.note || "", offerStyle],
          [it.saved ? -rm(it.saved) : 0, z ? S.zMoney : S.money],
          [rm(it.total), z ? S.zMoney : S.money],
        ]);
      }
    }
    seal(ws, r, W, merges);
    ws["!cols"] = [
      { wch: 11 },
      { wch: 13 },
      { wch: 8 },
      { wch: 40 },
      { wch: 7 },
      { wch: 12 },
      { wch: 32 },
      { wch: 12 },
      { wch: 13 },
    ];
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headRow, c: 0 },
        e: { r, c: W - 1 },
      }),
    };
    ws["!freeze"] = { xSplit: 0, ySplit: headRow + 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Line items");
  }

  XLSX.writeFile(
    wb,
    `SS-FOO-sales-${scopeLabel.replace(/\s+/g, "-")}-${stamp()}.xlsx`,
  );
}

/* ================================= PDF ================================= */

/* The on-screen formatter has no thousand separators — right for a receipt
   tape 70mm wide, wrong for a report where totals run into the thousands and
   RM3640.78 is a moment's hesitation to read. */
const money = (sen) => {
  const n = Math.round(Number(sen) || 0);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const whole = Math.floor(a / 100).toLocaleString("en-MY");
  return `${sign}RM${whole}.${String(a % 100).padStart(2, "0")}`;
};

const C = {
  ink: [20, 23, 31],
  dim: [107, 115, 135],
  faint: [152, 160, 178],
  rose: [229, 25, 95],
  green: [14, 138, 79],
  amber: [217, 116, 0],
  blue: [27, 111, 224],
  paper: [245, 247, 250],
  rule: [216, 222, 232],
};

export function exportPdf(sales, scopeLabel) {
  const s = summarise(sales);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  /* masthead */
  doc.setFillColor(...C.ink).rect(0, 0, W, 30, "F");
  doc.setFillColor(...C.rose).rect(0, 30, W, 1.6, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(17);
  doc.text(SHOP.name, M, 15);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8.5)
    .setTextColor(190, 195, 210);
  doc.text((SHOP.lines || []).join("   ·   "), M, 22);
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255);
  doc.text(`SALES REPORT — ${scopeLabel.toUpperCase()}`, W - M, 15, {
    align: "right",
  });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(190, 195, 210);
  doc.text(`${dateStr(new Date())}   ${timeStr(new Date())}`, W - M, 21, {
    align: "right",
  });

  /* headline figures */
  const cards = [
    ["TOTAL TAKEN", money(s.total), C.green],
    ["SALES", String(s.sales), C.ink],
    ["ITEMS SOLD", String(s.units), C.ink],
    ["AVERAGE SALE", money(s.average), C.ink],
  ];
  const gap = 3;
  const cw = (W - M * 2 - gap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value, colour], i) => {
    const x = M + i * (cw + gap);
    doc.setFillColor(...C.paper).roundedRect(x, 38, cw, 20, 1.6, 1.6, "F");
    doc
      .setDrawColor(...C.rule)
      .setLineWidth(0.2)
      .roundedRect(x, 38, cw, 20, 1.6, 1.6, "S");
    doc
      .setFont("helvetica", "bold")
      .setFontSize(6.6)
      .setTextColor(...C.faint);
    doc.text(label, x + 3.5, 44.5);
    doc.setFontSize(13).setTextColor(...colour);
    doc.text(value, x + 3.5, 53);
  });

  doc
    .setFont("helvetica", "normal")
    .setFontSize(8)
    .setTextColor(...C.dim);
  doc.text(
    `Before offers ${money(s.gross)}      Given away in offers ${money(s.saved)}`,
    M,
    64,
  );

  const table = (opts) =>
    autoTable(doc, {
      margin: { left: M, right: M },
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        lineColor: C.rule,
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: C.paper },
      ...opts,
    });

  const section = (title, y) => {
    doc
      .setFont("helvetica", "bold")
      .setFontSize(9.5)
      .setTextColor(...C.ink);
    doc.text(title.toUpperCase(), M, y);
    return y + 2;
  };

  table({
    startY: section("Payment methods", 74),
    head: [["Method", "Sales", "Amount", "Share"]],
    headStyles: {
      fillColor: C.rose,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    body: Object.keys(METHODS)
      .filter((m) => s.countByMethod[m])
      .map((m) => [
        METHODS[m].label,
        s.countByMethod[m],
        money(s.byMethod[m]),
        s.total ? `${Math.round((s.byMethod[m] / s.total) * 100)}%` : "—",
      ]),
    foot: [["Total", s.sales, money(s.total), ""]],
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: C.ink,
      fontStyle: "bold",
    },
    columnStyles: {
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 20 },
    },
  });

  table({
    startY: section(
      "By till — each row reconciles on its own",
      doc.lastAutoTable.finalY + 9,
    ),
    head: [["Till", "Sales", "Cash box", "DuitNow QR", "Card", "All methods"]],
    headStyles: {
      fillColor: C.amber,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    body: Object.entries(s.byTill).map(([t, v]) => [
      TILLS[t]?.name || t,
      v.count,
      v.cash ? money(v.cash) : "—",
      v.qr ? money(v.qr) : "—",
      v.card ? money(v.card) : "—",
      money(v.total),
    ]),
    columnStyles: {
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 26, fontStyle: "bold" },
      3: { halign: "right", cellWidth: 26 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 28 },
    },
  });
  doc
    .setFont("helvetica", "normal")
    .setFontSize(7.5)
    .setTextColor(...C.dim);
  doc.text(
    "Each till has its own cash box and its own DuitNow standee, so every row reconciles on its own.",
    M,
    doc.lastAutoTable.finalY + 4.5,
  );

  table({
    startY: section("Cashiers", doc.lastAutoTable.finalY + 13),
    head: [["Cashier", "Sales", "Amount"]],
    headStyles: {
      fillColor: C.blue,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    body: Object.entries(s.byCashier)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([n, v]) => [n, v.count, money(v.total)]),
    columnStyles: {
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 32 },
    },
  });

  if (s.unverified > 0) {
    const y = doc.lastAutoTable.finalY + 7;
    doc
      .setFillColor(255, 240, 245)
      .roundedRect(M, y, W - M * 2, 12, 1.4, 1.4, "F");
    doc.setDrawColor(251, 211, 225).setLineWidth(0.2);
    doc.roundedRect(M, y, W - M * 2, 12, 1.4, 1.4, "S");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(196, 16, 79);
    doc.text(
      `${s.unverified} QR or card sale${s.unverified === 1 ? "" : "s"} recorded without a reference`,
      M + 4,
      y + 5,
    );
    doc.setFont("helvetica", "normal").setFontSize(7.5);
    doc.text(
      "Chase these today — they are the hardest to trace once the fair moves on.",
      M + 4,
      y + 9,
    );
  }

  /* products */
  doc.addPage();
  table({
    startY: section("Products sold", 20),
    head: [["Product", "Units", "Given away", "Takings", "Share"]],
    headStyles: {
      fillColor: C.green,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    body: s.products.map(([n, v]) => [
      n,
      v.qty,
      v.saved ? `-${money(v.saved)}` : "",
      money(v.total),
      s.total ? `${Math.round((v.total / s.total) * 100)}%` : "",
    ]),
    foot: [["Total", s.units, `-${money(s.saved)}`, money(s.total), ""]],
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: C.ink,
      fontStyle: "bold",
    },
    columnStyles: {
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 25 },
      3: { halign: "right", cellWidth: 27 },
      4: { halign: "right", cellWidth: 16 },
    },
  });

  /* every sale */
  doc.addPage();
  table({
    startY: section("Every sale", 20),
    head: [
      [
        "Receipt",
        "Time",
        "Till",
        "Cashier",
        "Paid by",
        "Reference",
        "Items",
        "Total",
      ],
    ],
    headStyles: {
      fillColor: C.ink,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 7.6,
      cellPadding: 1.7,
      lineColor: C.rule,
      lineWidth: 0.1,
    },
    body: sales.map((sale) => {
      const d = when(sale);
      return [
        sale.receiptNo || "",
        timeStr(d),
        (TILLS[sale.till]?.name || sale.till || "").replace(" till", ""),
        sale.cashierName || "",
        METHODS[sale.method]?.label || sale.method,
        sale.ref || (sale.method === "cash" ? "" : "— none —"),
        sale.qty || 0,
        money(sale.total),
      ];
    }),
    foot: [["", "", "", "", "", "Total", s.units, money(s.total)]],
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: C.ink,
      fontStyle: "bold",
    },
    columnStyles: {
      6: { halign: "right", cellWidth: 14 },
      7: { halign: "right", cellWidth: 24, fontStyle: "bold" },
    },
    didParseCell: (d) => {
      // Flag the unverified ones where they can be seen, not merely counted.
      if (
        d.section === "body" &&
        d.column.index === 5 &&
        d.cell.raw === "— none —"
      ) {
        d.cell.styles.textColor = [196, 16, 79];
      }
    },
  });

  /* footer on every page */
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc
      .setDrawColor(...C.rule)
      .setLineWidth(0.2)
      .line(M, H - 12, W - M, H - 12);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(7)
      .setTextColor(...C.faint);
    doc.text(`${SHOP.name} — sales report, ${scopeLabel}`, M, H - 8);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 8, { align: "right" });
  }

  doc.save(`SS-FOO-sales-${scopeLabel.replace(/\s+/g, "-")}-${stamp()}.pdf`);
}
