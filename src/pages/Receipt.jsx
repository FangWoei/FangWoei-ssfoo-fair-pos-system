import { createPortal } from "react-dom";
import { METHODS } from "../lib/db";
import { formatRM } from "../lib/pricing";

/** Printed at the top of every receipt. Edit for your stall.
    Keep each address line short — anything wider than the paper wraps and
    costs you a line, so break the address yourself rather than letting it
    fall where it likes. */
export const SHOP = {
  name: "BZU-BZU FAIR",
  lines: [
    "SS FOO SDN BHD",
    "7, Lorong 41, Taman Ria,",
    "34700 Taiping, Perak.",
  ],
  footer: "Thank you — come again",
};

const stamp = (d) =>
  new Date(d).toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The printed receipt: stall name at the top, total at the bottom, the way a
 * customer expects to read one.
 *
 * Kept short on purpose. The XP-370B is a label printer, so it cuts at a fixed
 * length, and anything taller than one label spills onto a second one that
 * comes out after the first — which reads as though the total printed before
 * the header. Every line here has to earn its place.
 *
 * Quantity rides on the item's own line ("2× Kopi O") so it is always visible.
 * The line beneath it, carrying unit price and any offer, only prints when it
 * adds something — for a single item at full price it would just repeat.
 *
 * Rendered through a portal onto <body>, deliberately. The print stylesheet
 * hides the whole till with `.app { display: none }`, and a display:none
 * ancestor takes its entire subtree with it — a child cannot opt back in. If
 * this sat inside the app tree the printed page would come out blank.
 */
export default function Receipt({ sale }) {
  if (!sale) return null;

  return createPortal(
    <div className="printarea">
      {/* ---- the stall ---- */}
      <h1>{SHOP.name}</h1>
      <div className="company">{SHOP.company}</div>
      {SHOP.lines.map((l) => (
        <div className="c" key={l}>
          {l}
        </div>
      ))}
      <div className="rule" />

      {/* ---- who, when, which till ---- */}
      <div className="r">
        <span>{sale.receiptNo}</span>
        <span>
          {sale.till}
          {sale.cashierName ? ` · ${sale.cashierName}` : ""}
        </span>
      </div>
      <div className="r">
        <span>{stamp(sale.at)}</span>
        <span>
          {sale.qty} item{sale.qty === 1 ? "" : "s"}
        </span>
      </div>
      <div className="rule" />

      {/* ---- what was bought ---- */}
      {sale.items.map((it, i) => (
        <div key={i}>
          <div className="r">
            <span className="g">
              {it.qty}× {it.name}
            </span>
            <span>{formatRM(it.total)}</span>
          </div>
          {(it.qty > 1 || it.saved > 0) && (
            <div className="r ind">
              <span className="g">
                @ {formatRM(it.unitPrice)}
                {it.note ? ` · ${it.note}` : ""}
              </span>
              {it.saved > 0 && <span>-{formatRM(it.saved)}</span>}
            </div>
          )}
        </div>
      ))}

      {/* ---- the money, last ---- */}
      <div className="rule" />
      <div className="r">
        <span>Subtotal</span>
        <span>{formatRM(sale.gross)}</span>
      </div>
      {sale.saved > 0 && (
        <div className="r">
          <span>You saved</span>
          <span>-{formatRM(sale.saved)}</span>
        </div>
      )}
      <div className="r big">
        <span>TOTAL</span>
        <span>{formatRM(sale.total)}</span>
      </div>
      <div className="r">
        <span>{METHODS[sale.method]?.label || sale.method}</span>
        <span>
          {sale.method === "cash"
            ? `${formatRM(sale.cashGiven)} · change ${formatRM(sale.change)}`
            : sale.ref || ""}
        </span>
      </div>

      <div className="rule" />
      <div className="c">{SHOP.footer}</div>
    </div>,
    document.body,
  );
}
