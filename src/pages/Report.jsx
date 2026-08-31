import { useEffect, useMemo, useState } from "react";
import Receipt from "../components/Receipt";
import { diaperClaim, SET_SIZE } from "../lib/claims";
import { METHODS, TILLS, watchSalesSince } from "../lib/db";
import {
  exportClaimExcel,
  exportClaimPdf,
  exportExcel,
  exportPdf,
} from "../lib/exportSales";
import { formatRM } from "../lib/pricing";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const fairStart = () => new Date(Date.now() - 5 * 864e5);

export default function Report({ products = [] }) {
  const [scope, setScope] = useState("today");
  const [sales, setSales] = useState([]);
  const [reprint, setReprint] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  /* The claim runs from a date the shopkeeper chooses, because it started
     part-way through the fair and the company only reimburses from then. */
  const [claimFrom, setClaimFrom] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });

  useEffect(
    () =>
      watchSalesSince(
        scope === "today" ? startOfToday() : fairStart(),
        setSales,
        setError,
      ),
    [scope],
  );

  useEffect(() => {
    if (!reprint) return;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [reprint]);

  const s = useMemo(() => {
    const byMethod = {};
    const countByMethod = {};
    const byTill = {};
    const byProduct = {};
    let total = 0;
    let saved = 0;
    let unverified = 0;
    for (const sale of sales) {
      total += sale.total || 0;
      saved += sale.saved || 0;
      byMethod[sale.method] = (byMethod[sale.method] || 0) + (sale.total || 0);
      countByMethod[sale.method] = (countByMethod[sale.method] || 0) + 1;

      // Both tills take cash now, so each has its own float to count.
      const t = sale.till || "unknown";
      byTill[t] = byTill[t] || {
        total: 0,
        count: 0,
        cash: 0,
        qr: 0,
        card: 0,
        link: 0,
      };
      byTill[t].total += sale.total || 0;
      byTill[t].count++;
      byTill[t][sale.method] =
        (byTill[t][sale.method] || 0) + (sale.total || 0);
      if (sale.method !== "cash" && sale.verified === false) unverified++;
      for (const it of sale.items || []) {
        const e = (byProduct[it.name] ||= { qty: 0, total: 0 });
        e.qty += it.qty;
        e.total += it.total;
      }
    }
    return {
      total,
      saved,
      byMethod,
      countByMethod,
      byTill,
      unverified,
      top: Object.entries(byProduct)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10),
    };
  }, [sales]);

  const scopeLabel =
    scope === "today" ? "today" : scope === "claim" ? "claim" : "whole fair";

  const claim = useMemo(
    () => diaperClaim(sales, products, new Date(`${claimFrom}T00:00:00`)),
    [sales, products, claimFrom],
  );

  async function runExport(kind) {
    setBusy(kind);
    setError("");
    try {
      // A breath so the button can repaint before the work blocks the thread.
      await new Promise((r) => setTimeout(r, 30));
      if (scope === "claim") {
        const label = `from ${claimFrom}`;
        (kind === "excel" ? exportClaimExcel : exportClaimPdf)(claim, label);
      } else {
        (kind === "excel" ? exportExcel : exportPdf)(sales, scopeLabel);
      }
    } catch (e) {
      console.error(e);
      setError(`Export failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sales</h1>
        <div className="tabs">
          {[
            ["today", "Today"],
            ["fair", "Whole fair"],
            ["claim", "Diaper claim"],
          ].map(([id, label]) => (
            <button
              key={id}
              className="tab"
              aria-current={scope === id}
              onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button
          className="btn export"
          disabled={!sales.length || busy}
          onClick={() => runExport("excel")}>
          {busy === "excel" ? "Building…" : "Export Excel"}
        </button>
        <button
          className="btn export"
          disabled={!sales.length || busy}
          onClick={() => runExport("pdf")}>
          {busy === "pdf" ? "Building…" : "Export PDF"}
        </button>
      </div>

      {error && (
        <p
          style={{
            color: "var(--amber)",
            fontSize: 13,
            marginBottom: 16,
            maxWidth: 640,
            lineHeight: 1.5,
          }}>
          {error}
        </p>
      )}

      {scope === "claim" ? (
        <ClaimView claim={claim} from={claimFrom} onFrom={setClaimFrom} />
      ) : (
        <>
          <div className="stats">
            <div className="stat" style={{ "--chip": "var(--marigold)" }}>
              <small>Takings</small>
              <b className="figure">{formatRM(s.total)}</b>
            </div>
            <div className="stat" style={{ "--chip": "var(--sky)" }}>
              <small>Sales</small>
              <b className="figure">{sales.length}</b>
            </div>
            <div className="stat" style={{ "--chip": "var(--jade)" }}>
              <small>Given away in offers</small>
              <b className="figure">{formatRM(s.saved)}</b>
            </div>
            {Object.keys(METHODS).map((m) =>
              s.byMethod[m] ? (
                <div
                  className="stat"
                  key={m}
                  style={{ "--chip": `var(--pay-${m})` }}>
                  <small>
                    {METHODS[m].label} · {s.countByMethod[m]}{" "}
                    {s.countByMethod[m] === 1 ? "sale" : "sales"}
                  </small>
                  <b className="figure">{formatRM(s.byMethod[m])}</b>
                </div>
              ) : null,
            )}
          </div>

          {Object.keys(s.byTill).length > 0 && (
            <>
              <h2 className="section-title">
                By till — what to reconcile against what
              </h2>
              <table className="table" style={{ marginBottom: 22 }}>
                <thead>
                  <tr>
                    <th>Till</th>
                    <th>Sales</th>
                    <th style={{ textAlign: "right" }}>Cash box</th>
                    <th style={{ textAlign: "right" }}>DuitNow QR</th>
                    <th style={{ textAlign: "right" }}>Card</th>
                    <th style={{ textAlign: "right" }}>Card online</th>
                    <th style={{ textAlign: "right" }}>All methods</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.byTill).map(([till, v]) => (
                    <tr key={till}>
                      <td>
                        {TILLS[till]?.name || till}
                        {TILLS[till]?.qrLabel && v.qr > 0 && (
                          <span className="tag" style={{ marginLeft: 8 }}>
                            {TILLS[till].qrLabel}
                          </span>
                        )}
                        {TILLS[till]?.hasDrawer === false && v.cash > 0 && (
                          <span className="tag" style={{ marginLeft: 6 }}>
                            cash box, no drawer
                          </span>
                        )}
                      </td>
                      <td className="mono">{v.count}</td>
                      <td
                        className="mono"
                        style={{ textAlign: "right", fontWeight: 700 }}>
                        {v.cash > 0 ? formatRM(v.cash) : "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {v.qr > 0 ? formatRM(v.qr) : "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {v.card > 0 ? formatRM(v.card) : "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {v.link > 0 ? formatRM(v.link) : "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatRM(v.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="reconcile">
            <strong>Closing check</strong>
            <span>
              Each till has its own cash box and its own DuitNow standee, so
              every row above reconciles on its own. Count each cash box against
              its own figure, and match each till's QR total against the alerts
              for that standee — a shortfall you cannot place on one machine is
              much harder to explain. Card goes against the terminal's batch
              report. Compare counts as well as amounts: a count that matches
              while the total does not usually means one sale went through at
              the wrong amount.
            </span>
            {s.unverified > 0 && (
              <span className="warn">
                {s.unverified} QR or card{" "}
                {s.unverified === 1 ? "sale has" : "sales have"} no reference
                recorded. Chase those first — they are the hardest to trace once
                the day is over.
              </span>
            )}
          </div>

          {s.top.length > 0 && (
            <>
              <h2 className="section-title">Best sellers</h2>
              <table className="table" style={{ marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sold</th>
                    <th style={{ textAlign: "right" }}>Takings</th>
                  </tr>
                </thead>
                <tbody>
                  {s.top.map(([name, v]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="mono">{v.qty}</td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatRM(v.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2 className="section-title">Every sale</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Till</th>
                <th>Cashier</th>
                <th>Paid by</th>
                <th>Reference</th>
                <th>Items</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="mono">{sale.receiptNo}</td>
                  <td className="mono" style={{ color: "var(--text-dim)" }}>
                    {sale.localAt?.toDate
                      ? sale.localAt.toDate().toLocaleTimeString("en-MY", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td style={{ color: "var(--text-dim)" }}>{sale.till}</td>
                  <td style={{ color: "var(--text-dim)" }}>
                    {sale.cashierName || "—"}
                  </td>
                  <td>{METHODS[sale.method]?.label || sale.method}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {sale.ref ? (
                      sale.ref
                    ) : sale.method === "cash" ? (
                      <span style={{ color: "var(--ink-faint)" }}>—</span>
                    ) : (
                      <span className="tag off">unverified</span>
                    )}
                  </td>
                  <td className="mono">{sale.qty}</td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatRM(sale.total)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="linkbtn"
                      style={{ color: "var(--text-dim)" }}
                      onClick={() =>
                        setReprint({
                          ...sale,
                          at: sale.localAt?.toDate
                            ? sale.localAt.toDate()
                            : Date.now(),
                        })
                      }>
                      Reprint
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "var(--text-dim)" }}>
                    No sales in this period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <Receipt sale={reprint} />
    </div>
  );
}

/**
 * The supplier claim. Shows the whole basket of every qualifying sale, not
 * just the diaper lines — a customer paying for shampoo and diapers together
 * is one transaction, and a claim showing half of it invites questions.
 */
function ClaimView({ claim, from, onFrom }) {
  return (
    <>
      <div className="reconcile" style={{ marginBottom: 18 }}>
        <strong>Buy 4 free 1 — what to send the company</strong>
        <span>
          Every sale that gave a free diaper away, counted in complete sets of{" "}
          {SET_SIZE}. Sales that also included other products are listed in
          full, so the receipt and the claim line up.
        </span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
          }}>
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>
            Claim from
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
            style={{
              height: 38,
              padding: "0 11px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--line-strong)",
              background: "var(--card)",
              color: "var(--ink)",
            }}
          />
        </label>
      </div>

      <div className="stats">
        <div className="stat" style={{ "--chip": "var(--amber)" }}>
          <small>Free diapers to claim</small>
          <b className="figure">{claim.totals.free}</b>
        </div>
        <div className="stat" style={{ "--chip": "var(--ink)" }}>
          <small>Qualifying sales</small>
          <b className="figure">{claim.totals.sales}</b>
        </div>
        <div className="stat" style={{ "--chip": "var(--sky)" }}>
          <small>Diapers sold</small>
          <b className="figure">{claim.totals.diapers}</b>
        </div>
        <div className="stat" style={{ "--chip": "var(--green)" }}>
          <small>Sets of {SET_SIZE}</small>
          <b className="figure">{claim.totals.sets}</b>
        </div>
      </div>

      {claim.freeBySize.length > 0 && (
        <>
          <h2 className="section-title">Free diapers by size</h2>
          <table className="table" style={{ marginBottom: 22, maxWidth: 520 }}>
            <thead>
              <tr>
                <th>Size</th>
                <th style={{ textAlign: "right" }}>Free given</th>
              </tr>
            </thead>
            <tbody>
              {claim.freeBySize.map(([name, n]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", fontWeight: 700 }}>
                    {n}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="section-title">Every sale that gave a free diaper</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Receipt</th>
            <th>Date</th>
            <th>Time</th>
            <th>Till</th>
            <th>Cashier</th>
            <th style={{ textAlign: "right" }}>Diapers</th>
            <th style={{ textAlign: "right" }}>Free</th>
            <th>Also in the sale</th>
            <th style={{ textAlign: "right" }}>Sale total</th>
          </tr>
        </thead>
        <tbody>
          {claim.rows.map((r) => (
            <tr key={r.receiptNo}>
              <td className="mono">{r.receiptNo}</td>
              <td className="mono" style={{ color: "var(--ink-dim)" }}>
                {r.at.toLocaleDateString("en-MY", {
                  day: "2-digit",
                  month: "short",
                })}
              </td>
              <td className="mono" style={{ color: "var(--ink-dim)" }}>
                {r.at.toLocaleTimeString("en-MY", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td style={{ color: "var(--ink-dim)" }}>{r.till}</td>
              <td style={{ color: "var(--ink-dim)" }}>{r.cashier}</td>
              <td className="mono" style={{ textAlign: "right" }}>
                {r.diaperQty}
              </td>
              <td
                className="mono"
                style={{ textAlign: "right", fontWeight: 700 }}>
                {r.free}
              </td>
              <td style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                {r.others.length
                  ? r.others.map((o) => `${o.qty}× ${o.name}`).join(", ")
                  : "—"}
              </td>
              <td className="mono" style={{ textAlign: "right" }}>
                {formatRM(r.saleTotal)}
              </td>
            </tr>
          ))}
          {claim.rows.length === 0 && (
            <tr>
              <td colSpan={9} style={{ color: "var(--ink-dim)" }}>
                No sale since that date has given a free diaper away.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
