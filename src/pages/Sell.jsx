import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../App";
import Receipt from "../components/Receipt";
import { categoryColor } from "../lib/colors";
import { METHODS, recordSale } from "../lib/db";
import { openDrawer } from "../lib/drawer";
import {
  PAYMENT_CHECKS,
  isVerified,
  looksLikePaymentToken,
} from "../lib/payments";
import { OFFER_NONE, formatRM, priceLine, toSen } from "../lib/pricing";
import {
  PROMOTIONS,
  checkCanAdd,
  priceCartWithPromotions,
  promotionsFromProducts,
} from "../lib/promotions";
import { useEnterNav } from "../lib/useEnterNav";

export default function Sell({ products, till, me }) {
  const notify = useToast();
  const [lines, setLines] = useState([]);
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("All");
  const [paying, setPaying] = useState(null); // 'cash' | 'qr' | 'card'
  const [editing, setEditing] = useState(null); // line key being discounted
  const [printJob, setPrintJob] = useState(null);
  const scanRef = useRef(null);
  const linesRef = useRef(null);

  const active = useMemo(
    () => products.filter((p) => p.active !== false),
    [products],
  );

  /* The promotions written in promotions.js, plus every "buy X free Y of other
     products" offer set up in the Products page. Rebuilt whenever the
     catalogue changes, so an edit takes effect on both tills at once. */
  const promos = useMemo(
    () => [...PROMOTIONS, ...promotionsFromProducts(products)],
    [products],
  );
  const cats = useMemo(
    () => ["All", ...new Set(active.map((p) => p.category).filter(Boolean))],
    [active],
  );

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return active.filter((p) => {
      if (cat !== "All" && p.category !== cat) return false;
      if (!t) return true;
      return (
        p.name.toLowerCase().includes(t) ||
        String(p.barcode || "")
          .toLowerCase()
          .includes(t)
      );
    });
  }, [active, cat, term]);

  const cart = priceCartWithPromotions(lines, promos);
  const blocked = cart.blockers.length > 0;

  /* Follow the tape down as items are added. On a long sale the newest line is
     the one the cashier needs to see — that it went in, at what price, and
     whether an offer caught it. */
  useEffect(() => {
    const el = linesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  /* Keep the scanner input focused whenever nothing else is. A barcode gun is
     just a fast keyboard, so this is all the "scanner support" it needs. */
  const refocus = () => {
    if (!paying && !editing) scanRef.current?.focus();
  };
  useEffect(refocus, [paying, editing, lines.length]);

  /* ---------- cart ---------- */

  function add(product, by = 1) {
    /* Gift barcodes are refused until the cart has earned them. Catching it
       here — at the scan — matters: telling the cashier at the payment screen
       means the free bottle is already in the customer's bag. */
    const gate = checkCanAdd(product, lines, promos);
    if (!gate.ok) {
      notify(gate.reason, "warn");
      setTerm("");
      return;
    }
    // Allowed, but worth saying why it is not free — so the cashier can offer
    // the customer the extra item that would earn it.
    if (gate.note) notify(gate.note);

    setLines((prev) => {
      const i = prev.findIndex(
        (l) => l.productId === product.id && !l.discount,
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + by };
        return next;
      }
      return [
        ...prev,
        {
          key: Math.random().toString(36).slice(2),
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          tags: product.tags || [],
          offer: product.offer || { type: OFFER_NONE },
          qty: by,
          discount: null,
        },
      ];
    });
    setTerm("");
  }

  const setQty = (key, qty) =>
    setLines((p) =>
      qty <= 0
        ? p.filter((l) => l.key !== key)
        : p.map((l) => (l.key === key ? { ...l, qty } : l)),
    );

  const removeLine = (key) => setLines((p) => p.filter((l) => l.key !== key));

  const setDiscount = (key, discount) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, discount } : l)));

  function onScanSubmit(e) {
    e.preventDefault();
    const t = term.trim();
    if (!t) return;
    const exact = active.find(
      (p) => String(p.barcode || "").toLowerCase() === t.toLowerCase(),
    );
    if (exact) return add(exact);
    if (shown.length === 1) return add(shown[0]);
    if (shown.length === 0) notify(`Nothing matches "${t}"`, "warn");
  }

  /* ---------- finish a sale ---------- */

  async function finish(method, extra = {}) {
    const sale = {
      items: cart.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        unitPrice: l.unitPrice,
        qty: l.qty,
        total: l.priced.total,
        saved: l.priced.saved,
        note: l.priced.rule === "unit" ? "" : l.priced.note,
      })),
      qty: cart.qty,
      gross: cart.gross,
      saved: cart.saved,
      total: cart.total,
      method,
      cashGiven: extra.cashGiven ?? 0,
      change: extra.change ?? 0,
      ref: (extra.ref || "").trim(),
      verified: isVerified(method, extra.ref),
    };

    setPaying(null);
    setLines([]);

    const saved = await recordSale(sale, till.id, me);
    setPrintJob({
      ...sale,
      receiptNo: saved.receiptNo,
      till: till.id,
      cashierName: me?.name || "",
      at: Date.now(),
    });
    notify(
      `${saved.receiptNo} · ${formatRM(sale.total)} ${METHODS[method].label}`,
    );

    // Drawer is fire-and-forget and cash-only. The sale is already done.
    if (method === "cash" && till.hasDrawer) {
      openDrawer().then((r) => {
        if (!r.ok) notify(r.message, "warn");
      });
    }
  }

  // Print once the receipt has actually rendered.
  useEffect(() => {
    if (!printJob) return;
    const id = requestAnimationFrame(() => {
      window.print();
      setTimeout(refocus, 300);
    });
    return () => cancelAnimationFrame(id);
  }, [printJob]);

  /* ---------- render ---------- */

  const editLine = lines.find((l) => l.key === editing);

  return (
    <>
      <div className="sell">
        <div className="left">
          <form className="scanbar" onSubmit={onScanSubmit}>
            <span className="hint">Scan / search</span>
            <input
              ref={scanRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Point the gun at a barcode, or type a name"
              autoFocus
              autoComplete="off"
            />
            {term && (
              <button
                type="button"
                className="linkbtn"
                onClick={() => setTerm("")}
                style={{ color: "var(--text-dim)" }}>
                clear
              </button>
            )}
          </form>

          {cats.length > 2 && (
            <div className="cats">
              {cats.map((c) => (
                <button
                  key={c}
                  className="cat"
                  aria-pressed={cat === c}
                  style={{
                    "--chip":
                      c === "All" ? "var(--marigold)" : categoryColor(c),
                  }}
                  onClick={() => {
                    setCat(c);
                    refocus();
                  }}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="grid">
            {shown.map((p) => (
              <button
                key={p.id}
                className="tile"
                style={{ "--chip": categoryColor(p.category) }}
                onClick={() => add(p)}>
                <span className="tile-name">{p.name}</span>
                <span className="tile-foot">
                  <span className="tile-price">{formatRM(p.price)}</span>
                  {p.offer?.type && p.offer.type !== OFFER_NONE && (
                    <span className="tile-offer">{offerBadge(p.offer)}</span>
                  )}
                </span>
              </button>
            ))}
            {shown.length === 0 && (
              <p style={{ color: "var(--text-dim)", gridColumn: "1/-1" }}>
                No products here. Add them under Products.
              </p>
            )}
          </div>
        </div>

        <div className="tape-wrap">
          <div className="tape">
            <div className="tape-head">
              <h2>Current sale</h2>
              <div className="sub">
                {cart.qty} {cart.qty === 1 ? "item" : "items"} · {till.name}
              </div>
            </div>

            <div className="lines-wrap">
              <div className="lines" ref={linesRef}>
                {cart.lines.length === 0 && (
                  <p className="empty">
                    Tap a product or scan a barcode.
                    <br />
                    The sale builds up here.
                  </p>
                )}
                {cart.lines.map((l) => (
                  <CartLine
                    key={l.key}
                    line={l}
                    onQty={(q) => setQty(l.key, q)}
                    onRemove={() => removeLine(l.key)}
                    onDiscount={() => setEditing(l.key)}
                  />
                ))}
              </div>
            </div>

            <div className="totals mono">
              {cart.applied.map((a) => (
                <div className="trow promo" key={a.id}>
                  <span>
                    {a.name}
                    {a.times > 1 ? ` ×${a.times}` : ""}
                  </span>
                  <span>{a.saving > 0 ? `-${formatRM(a.saving)}` : ""}</span>
                </div>
              ))}
              <div className="trow">
                <span>Subtotal</span>
                <span>{formatRM(cart.gross)}</span>
              </div>
              {cart.saved > 0 && (
                <div className="trow save">
                  <span>Offers and discounts</span>
                  <span>-{formatRM(cart.saved)}</span>
                </div>
              )}
              <div className="grand">
                <span>To pay</span>
                <b className="figure">{formatRM(cart.total)}</b>
              </div>
            </div>

            <div className="pay">
              {blocked && (
                <div className="blockers">
                  <strong>Promotion not complete</strong>
                  {cart.blockers.map((b, i) => (
                    <span key={i}>{b.message}</span>
                  ))}
                </div>
              )}
              {till.methods.map((m) => (
                <button
                  key={m}
                  className={`paybtn ${m}`}
                  disabled={cart.lines.length === 0 || blocked}
                  onClick={() => setPaying(m)}>
                  <span>{METHODS[m].label}</span>
                  <small className="mono">{formatRM(cart.total)}</small>
                </button>
              ))}
              {cart.lines.length > 0 && (
                <button className="voidbtn" onClick={() => setLines([])}>
                  Clear sale
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {paying === "cash" && (
        <CashModal
          due={cart.total}
          onCancel={() => setPaying(null)}
          onDone={finish}
        />
      )}
      {(paying === "qr" || paying === "card") && (
        <ConfirmModal
          method={paying}
          due={cart.total}
          onCancel={() => setPaying(null)}
          onDone={(ref) => finish(paying, { ref })}
        />
      )}
      {editLine && (
        <DiscountModal
          line={editLine}
          onCancel={() => setEditing(null)}
          onSave={(d) => {
            setDiscount(editLine.key, d);
            setEditing(null);
          }}
        />
      )}

      <Receipt sale={printJob} />
    </>
  );
}

function offerBadge(offer) {
  if (offer.type === "freebie") return `${offer.buyQty}+${offer.freeQty}`;
  if (offer.type === "bulk" && offer.tiers?.length) {
    const t = offer.tiers[offer.tiers.length - 1];
    return `${t.qty}/${formatRM(t.price).replace("RM", "").replace(".00", "")}`;
  }
  return "Offer";
}

function CartLine({ line, onQty, onRemove, onDiscount }) {
  const p = line.priced;
  const discounted = p.total !== p.gross;
  return (
    <div className={line.discount ? "line sel" : "line"}>
      <div className="line-top">
        <span className="line-name">{line.name}</span>
        <span className="mono">
          {discounted && (
            <span className="line-amt struck">{formatRM(p.gross)}</span>
          )}
          <span className="line-amt">{formatRM(p.total)}</span>
        </span>
      </div>
      <div className="line-sub mono">
        <span className="qty">
          <button onClick={() => onQty(line.qty - 1)} aria-label="One less">
            −
          </button>
          <span>{line.qty}</span>
          <button onClick={() => onQty(line.qty + 1)} aria-label="One more">
            +
          </button>
        </span>
        <span>@ {formatRM(line.unitPrice)}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="linkbtn" onClick={onDiscount}>
          {line.discount ? "Discount" : "Discount"}
        </button>
        <button className="linkbtn danger" onClick={onRemove}>
          Remove
        </button>
      </div>
      {p.note && (
        <div
          className={
            p.rule === "discount"
              ? "line-sub line-note cut"
              : p.rule === "unit"
                ? "line-sub line-note warn"
                : "line-sub line-note"
          }>
          {p.note}
          {p.rule !== "unit" && p.saved > 0 && ` · saved ${formatRM(p.saved)}`}
        </div>
      )}
      {p.upsell && (
        <div className="line-sub line-note warn">
          {p.upsell.extra} more makes it {formatRM(p.upsell.total)} —{" "}
          {formatRM(p.upsell.saves)} cheaper
        </div>
      )}
    </div>
  );
}

/* ---------- payment modals ---------- */

const NOTES = [100, 500, 1000, 2000, 5000, 10000];

function CashModal({ due, onCancel, onDone }) {
  const enter = useEnterNav();
  const [given, setGiven] = useState("");
  const sen = toSen(given);
  const change = sen - due;
  const enough = sen >= due;

  const bump = (amt) => setGiven((g) => ((toSen(g) + amt) / 100).toFixed(2));

  return (
    <Scrim onCancel={onCancel} nav={enter}>
      <h3>Cash</h3>
      <div className="due mono">
        <small>Amount due</small>
        <b className="figure">{formatRM(due)}</b>
      </div>

      <div className="notes mono">
        <button
          className="note exact"
          onClick={() => setGiven((due / 100).toFixed(2))}>
          Exact
        </button>
        <button className="note" onClick={() => setGiven("")}>
          Reset
        </button>
        {NOTES.map((n) => (
          <button key={n} className="note" onClick={() => bump(n)}>
            +{formatRM(n).replace(".00", "")}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Cash received</span>
        <input
          className="mono"
          inputMode="decimal"
          value={given}
          autoFocus
          onChange={(e) => setGiven(e.target.value)}
          placeholder="0.00"
        />
      </label>

      <div className="change mono">
        <span>Change</span>
        <b className={enough ? "figure" : "figure short"}>
          {enough ? formatRM(change) : `Short ${formatRM(-change)}`}
        </b>
      </div>

      <div className="actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!enough}
          onClick={() => onDone("cash", { cashGiven: sen, change })}>
          Take payment
        </button>
      </div>
    </Scrim>
  );
}

/**
 * QR and card both come down to a person looking at a screen and saying yes,
 * so the button names the thing they must be looking at. "Customer's phone
 * shows PAID" is much harder to press on autopilot than "Confirm".
 */
function ConfirmModal({ method, due, onCancel, onDone }) {
  const enter = useEnterNav();
  const cfg = PAYMENT_CHECKS[method];
  const [ref, setRef] = useState("");
  const clean = ref.trim();
  const isToken = looksLikePaymentToken(clean);
  const blocked = (cfg.requireRef && !clean) || isToken;

  return (
    <Scrim onCancel={onCancel} nav={enter}>
      <h3>{cfg.title}</h3>
      <p className="lede">{cfg.instruction}</p>

      <div className="due mono">
        <small>Amount due</small>
        <b className="figure">{formatRM(due)}</b>
      </div>

      {method === "qr" && (
        <div className="qrbox">
          <img src="/duitnow-qr.png" alt="DuitNow QR code" />
          <p>Or point the standee at the customer</p>
        </div>
      )}

      <label className="field">
        <span>{cfg.refLabel}</span>
        <input
          className="mono"
          value={ref}
          autoFocus
          onChange={(e) => setRef(e.target.value)}
        />
      </label>
      <p className="lede" style={{ marginTop: -8 }}>
        {cfg.refHint}
      </p>

      {isToken && (
        <p className="unverified danger">
          That looks like the customer's own payment code, not a reference.
          Scanning it here cannot take payment, and it must not be stored —
          clear the box. To charge a customer's code you need the TNG Merchant
          app, which does the charging and then gives you a reference to type.
        </p>
      )}

      {cfg.warnWithoutRef && !clean && !isToken && (
        <p className="unverified">
          No reference — this sale will be flagged unverified in the Sales tab.
        </p>
      )}

      <div className="actions">
        <button className="btn" onClick={onCancel}>
          {cfg.declineLabel}
        </button>
        <button
          className="btn primary"
          disabled={blocked}
          onClick={() => onDone(clean)}>
          {cfg.confirmLabel}
        </button>
      </div>
    </Scrim>
  );
}

function DiscountModal({ line, onCancel, onSave }) {
  const enter = useEnterNav();
  const [type, setType] = useState(line.discount?.type || "percent");
  const [value, setValue] = useState(
    line.discount
      ? line.discount.type === "percent"
        ? String(line.discount.value)
        : (line.discount.value / 100).toFixed(2)
      : "",
  );

  const discount = value
    ? { type, value: type === "percent" ? Number(value) : toSen(value) }
    : null;
  const preview = priceLine({ ...line, discount });
  const withOffer = priceLine({ ...line, discount: null });

  return (
    <Scrim onCancel={onCancel} nav={enter}>
      <h3>Discount — {line.name}</h3>
      <p className="lede">
        A manual discount replaces this product's offer. The two never stack.
      </p>
      <div className="row">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="percent">Percent off</option>
            <option value="amount">Ringgit off</option>
          </select>
        </label>
        <label className="field">
          <span>{type === "percent" ? "Percent" : "Amount (RM)"}</span>
          <input
            className="mono"
            inputMode="decimal"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>

      <div className="preview mono">
        <div className="prow">
          <span>
            {line.qty} × {formatRM(line.unitPrice)}
          </span>
          <span>{formatRM(preview.gross)}</span>
        </div>
        {withOffer.saved > 0 && (
          <div className="prow">
            <em>Offer it replaces: {withOffer.note}</em>
            <span>{formatRM(withOffer.total)}</span>
          </div>
        )}
        <div className="prow" style={{ fontWeight: 700, fontSize: 15 }}>
          <span>Line total</span>
          <span>{formatRM(preview.total)}</span>
        </div>
      </div>

      <div className="actions">
        {line.discount && (
          <button className="btn danger" onClick={() => onSave(null)}>
            Remove discount
          </button>
        )}
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onSave(discount)}>
          Apply
        </button>
      </div>
    </Scrim>
  );
}

function Scrim({ children, onCancel, nav }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" {...(nav || {})}>
        {children}
      </div>
    </div>
  );
}
