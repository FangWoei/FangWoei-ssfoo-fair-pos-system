import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { SHOP } from "../components/Receipt";
import { METHODS } from "./db";
import { formatRM } from "./pricing";

/**
 * Exporting the day's takings.
 *
 * Money goes out as NUMBERS, never as the string "RM42.90". A column of text
 * cannot be summed, and the first thing anyone does with a sales export is
 * select a column and look at the total. Sen are divided down to ringgit here
 * and the cell is formatted "RM"#,##0.00, so it reads correctly and still adds
 * up.
 */

const rm = (sen) => Math.round(Number(sen) || 0) / 100;
const MONEY_FMT = '"RM"#,##0.00';

const when = (sale) =>
  sale.localAt?.toDate
    ? sale.localAt.toDate()
    : new Date(sale.localAt || Date.now());

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

/** Everything both exports need, worked out once. */
export function summarise(sales) {
  const byMethod = {};
  const countByMethod = {};
  const byProduct = {};
  const byCashier = {};
  let total = 0;
  let gross = 0;
  let saved = 0;
  let unverified = 0;
  let units = 0;

  for (const s of sales) {
    total += s.total || 0;
    gross += s.gross || 0;
    saved += s.saved || 0;
    units += s.qty || 0;
    byMethod[s.method] = (byMethod[s.method] || 0) + (s.total || 0);
    countByMethod[s.method] = (countByMethod[s.method] || 0) + 1;
    if (s.method !== "cash" && s.verified === false) unverified++;

    const c = s.cashierName || "—";
    byCashier[c] = byCashier[c] || { count: 0, total: 0 };
    byCashier[c].count++;
    byCashier[c].total += s.total || 0;

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
    byMethod,
    countByMethod,
    unverified,
    byCashier,
    products: Object.entries(byProduct).sort((a, b) => b[1].total - a[1].total),
  };
}

/* ------------------------------- Excel ------------------------------- */

export function exportExcel(sales, scopeLabel) {
  const s = summarise(sales);
  const wb = XLSX.utils.book_new();

  /* Sheet 1 — the numbers you reconcile against the bank and the terminal. */
  const summary = [
    [SHOP.name],
    [SHOP.lines?.[0] || ""],
    [`Sales report — ${scopeLabel}`],
    [`Generated ${dateStr(new Date())} ${timeStr(new Date())}`],
    [],
    ["TAKINGS"],
    ["Sales", s.sales],
    ["Items sold", s.units],
    ["Before offers", rm(s.gross)],
    ["Given away in offers", -rm(s.saved)],
    ["Total taken", rm(s.total)],
    [],
    ["BY PAYMENT METHOD", "Sales", "Amount"],
    ...Object.keys(METHODS)
      .filter((m) => s.countByMethod[m])
      .map((m) => [METHODS[m].label, s.countByMethod[m], rm(s.byMethod[m])]),
    [],
    ["BY CASHIER", "Sales", "Amount"],
    ...Object.entries(s.byCashier).map(([n, v]) => [n, v.count, rm(v.total)]),
    [],
    ["CHECKS"],
    ["QR or card sales with no reference", s.unverified],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 14 }];
  // money columns
  for (const addr of ["B9", "B10", "B11"])
    if (ws1[addr]) ws1[addr].z = MONEY_FMT;
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  /* Sheet 2 — one row per sale. */
  const rows = sales.map((sale) => {
    const d = when(sale);
    return {
      Receipt: sale.receiptNo || "",
      Date: dateStr(d),
      Time: timeStr(d),
      Till: sale.till || "",
      Cashier: sale.cashierName || "",
      "Paid by": METHODS[sale.method]?.label || sale.method,
      Reference: sale.ref || "",
      Verified:
        sale.method === "cash" ? "n/a" : sale.verified === false ? "NO" : "yes",
      Items: sale.qty || 0,
      "Before offers": rm(sale.gross),
      Discount: -rm(sale.saved),
      Total: rm(sale.total),
      "Cash given": sale.method === "cash" ? rm(sale.cashGiven) : "",
      Change: sale.method === "cash" ? rm(sale.change) : "",
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(rows);
  ws2["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 9 },
    { wch: 7 },
    { wch: 13 },
    { wch: 11 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  moneyCols(ws2, rows.length, ["J", "K", "L", "M", "N"]);
  ws2["!autofilter"] = { ref: `A1:N${rows.length + 1}` };
  ws2["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws2, "Sales");

  /* Sheet 3 — one row per product. This is the stock check. */
  const prodRows = s.products.map(([name, v]) => ({
    Product: name,
    "Units sold": v.qty,
    "Given away": rm(v.saved),
    Takings: rm(v.total),
  }));
  const ws3 = XLSX.utils.json_to_sheet(prodRows);
  ws3["!cols"] = [{ wch: 40 }, { wch: 11 }, { wch: 13 }, { wch: 13 }];
  moneyCols(ws3, prodRows.length, ["C", "D"]);
  XLSX.utils.book_append_sheet(wb, ws3, "Products");

  /* Sheet 4 — every line of every sale, for anything the others cannot answer. */
  const lineRows = [];
  for (const sale of sales) {
    const d = when(sale);
    for (const it of sale.items || []) {
      lineRows.push({
        Receipt: sale.receiptNo || "",
        Date: dateStr(d),
        Time: timeStr(d),
        Product: it.name,
        Qty: it.qty,
        "Unit price": rm(it.unitPrice),
        Offer: it.note || "",
        Discount: -rm(it.saved),
        "Line total": rm(it.total),
      });
    }
  }
  const ws4 = XLSX.utils.json_to_sheet(lineRows);
  ws4["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 34 },
    { wch: 6 },
    { wch: 11 },
    { wch: 26 },
    { wch: 11 },
    { wch: 12 },
  ];
  moneyCols(ws4, lineRows.length, ["F", "H", "I"]);
  ws4["!autofilter"] = { ref: `A1:I${lineRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, ws4, "Line items");

  XLSX.writeFile(
    wb,
    `SS-FOO-sales-${scopeLabel.replace(/\s+/g, "-")}-${stamp()}.xlsx`,
  );
}

function moneyCols(ws, rowCount, cols) {
  for (const c of cols) {
    for (let r = 2; r <= rowCount + 1; r++) {
      const cell = ws[`${c}${r}`];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  }
}

/* -------------------------------- PDF -------------------------------- */

export function exportPdf(sales, scopeLabel) {
  const s = summarise(sales);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text(SHOP.name, 14, 18);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text((SHOP.lines || []).join(" · "), 14, 24);
  doc.setFontSize(11).setTextColor(20);
  doc.text(`Sales report — ${scopeLabel}`, 14, 32);
  doc.setFontSize(8).setTextColor(120);
  doc.text(
    `Generated ${dateStr(new Date())} ${timeStr(new Date())}`,
    W - 14,
    32,
    {
      align: "right",
    },
  );

  autoTable(doc, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 1.6 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Sales", String(s.sales)],
      ["Items sold", String(s.units)],
      ["Before offers", formatRM(s.gross)],
      ["Given away in offers", `-${formatRM(s.saved)}`],
      ["TOTAL TAKEN", formatRM(s.total)],
    ],
    margin: { left: 14, right: W / 2 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [["Payment method", "Sales", "Amount"]],
    body: Object.keys(METHODS)
      .filter((m) => s.countByMethod[m])
      .map((m) => [
        METHODS[m].label,
        s.countByMethod[m],
        formatRM(s.byMethod[m]),
      ]),
    headStyles: { fillColor: [229, 25, 95], fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  if (s.unverified > 0) {
    doc.setFontSize(9).setTextColor(196, 16, 79);
    doc.text(
      `${s.unverified} QR or card sale(s) recorded without a reference.`,
      14,
      doc.lastAutoTable.finalY + 6,
    );
    doc.setTextColor(20);
  }

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + (s.unverified > 0 ? 11 : 6),
    head: [["Cashier", "Sales", "Amount"]],
    body: Object.entries(s.byCashier).map(([n, v]) => [
      n,
      v.count,
      formatRM(v.total),
    ]),
    headStyles: { fillColor: [20, 23, 31], fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [["Product", "Units", "Given away", "Takings"]],
    body: s.products.map(([n, v]) => [
      n,
      v.qty,
      v.saved ? `-${formatRM(v.saved)}` : "",
      formatRM(v.total),
    ]),
    headStyles: { fillColor: [14, 138, 79], fontSize: 9 },
    styles: { fontSize: 8.5 },
    columnStyles: {
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 26 },
    },
    margin: { left: 14, right: 14 },
  });

  doc.addPage();
  autoTable(doc, {
    startY: 16,
    head: [
      [
        "Receipt",
        "Time",
        "Till",
        "Cashier",
        "Paid by",
        "Ref",
        "Items",
        "Total",
      ],
    ],
    body: sales.map((sale) => {
      const d = when(sale);
      return [
        sale.receiptNo || "",
        timeStr(d),
        sale.till || "",
        sale.cashierName || "",
        METHODS[sale.method]?.label || sale.method,
        sale.ref || (sale.method === "cash" ? "" : "—"),
        sale.qty || 0,
        formatRM(sale.total),
      ];
    }),
    headStyles: { fillColor: [20, 23, 31], fontSize: 8.5 },
    styles: { fontSize: 8 },
    columnStyles: { 6: { halign: "right" }, 7: { halign: "right" } },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7.5).setTextColor(140);
      doc.text(
        `${SHOP.name} — ${scopeLabel}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
      doc.text(`Page ${page}`, W - 14, doc.internal.pageSize.getHeight() - 8, {
        align: "right",
      });
      doc.setTextColor(20);
    },
  });

  doc.save(`SS-FOO-sales-${scopeLabel.replace(/\s+/g, "-")}-${stamp()}.pdf`);
}
