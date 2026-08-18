import { useState } from "react";
import { useToast } from "../App";
import { newProductRef, removeProduct, saveProduct } from "../lib/db";
import {
  emptyOffer,
  formatRM,
  OFFER_BULK,
  OFFER_FREEBIE,
  OFFER_NONE,
  priceLine,
  toRMInput,
  toSen,
} from "../lib/pricing";
import { useEnterNav } from "../lib/useEnterNav";

const blank = () => ({
  name: "",
  barcode: "",
  category: "",
  price: 0,
  active: true,
  sort: Date.now(),
  offer: emptyOffer(),
});

export default function Admin({ products }) {
  const notify = useToast();
  const [editing, setEditing] = useState(null);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Products</h1>
        <span className="pill">{products.length} in the till</span>
        <div className="spacer" />
        <button
          className="btn primary"
          style={{ flex: "0 0 auto", padding: "0 20px" }}
          onClick={() => setEditing({ id: null, data: blank() })}>
          Add product
        </button>
      </div>

      {products.length === 0 ? (
        <div style={{ color: "var(--text-dim)", maxWidth: 460 }}>
          <p>
            Nothing yet. Add your products one by one, or drop in a sample
            catalogue of 24 to feel out the grid and the offers first — you can
            edit or delete any of them after.
          </p>
          <button
            className="btn"
            style={{ height: 44, padding: "0 18px" }}
            onClick={async () => {
              for (const p of SAMPLE) await saveProduct(newProductRef().id, p);
              notify("Loaded 24 sample products");
            }}>
            Load sample catalogue
          </button>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Promo tags</th>
              <th>Price</th>
              <th>Offer</th>
              <th>On the grid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ color: "var(--text-dim)" }}>
                  {p.category || "—"}
                </td>
                <td
                  className="mono"
                  style={{ color: "var(--text-dim)", fontSize: 12 }}>
                  {p.tags?.length ? p.tags.join(", ") : "—"}
                </td>
                <td className="mono">{formatRM(p.price)}</td>
                <td>
                  {p.offer?.type && p.offer.type !== OFFER_NONE ? (
                    <span className="tag on">{describe(p.offer)}</span>
                  ) : (
                    <span className="tag">None</span>
                  )}
                </td>
                <td>
                  {p.active === false ? (
                    <span className="tag off">Hidden</span>
                  ) : (
                    <span className="tag">Showing</span>
                  )}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    className="linkbtn"
                    style={{ color: "var(--text-dim)" }}
                    onClick={() => setEditing({ id: p.id, data: p })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ProductForm
          initial={editing.data}
          isNew={!editing.id}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            await removeProduct(editing.id);
            notify(`Removed ${editing.data.name}`);
            setEditing(null);
          }}
          onSave={async (data) => {
            const id = editing.id || newProductRef().id;
            await saveProduct(id, data);
            notify(`Saved ${data.name}`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function describe(offer) {
  if (offer.type === OFFER_FREEBIE)
    return `Buy ${offer.buyQty} free ${offer.freeQty}`;
  if (offer.type === OFFER_BULK)
    return offer.tiers
      .map((t) => `${t.qty} for ${formatRM(t.price)}`)
      .join(", ");
  return "None";
}

function ProductForm({ initial, isNew, onSave, onDelete, onClose }) {
  const enter = useEnterNav();
  const [f, setF] = useState({
    ...initial,
    priceInput: toRMInput(initial.price),
    offer: { ...emptyOffer(), ...(initial.offer || {}) },
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setOffer = (k, v) =>
    setF((s) => ({ ...s, offer: { ...s.offer, [k]: v } }));
  const price = toSen(f.priceInput);

  const setTier = (i, k, v) =>
    setF((s) => {
      const tiers = [...s.offer.tiers];
      tiers[i] = { ...tiers[i], [k]: v };
      return { ...s, offer: { ...s.offer, tiers } };
    });

  const addTier = () =>
    setOffer("tiers", [
      ...f.offer.tiers,
      { qty: (f.offer.tiers.at(-1)?.qty || 1) + 1, price: 0 },
    ]);

  const dropTier = (i) =>
    setOffer(
      "tiers",
      f.offer.tiers.filter((_, x) => x !== i),
    );

  async function save() {
    if (!f.name.trim()) return;
    setBusy(true);
    const offer =
      f.offer.type === OFFER_BULK
        ? {
            type: OFFER_BULK,
            tiers: f.offer.tiers
              .map((t) => ({
                qty: Number(t.qty) || 0,
                price: toSen(t.priceInput ?? toRMInput(t.price)),
              }))
              .filter((t) => t.qty >= 2 && t.price > 0)
              .sort((a, b) => a.qty - b.qty),
            buyQty: 0,
            freeQty: 0,
          }
        : f.offer.type === OFFER_FREEBIE
          ? {
              type: OFFER_FREEBIE,
              buyQty: Number(f.offer.buyQty) || 0,
              freeQty: Number(f.offer.freeQty) || 0,
              tiers: [],
            }
          : emptyOffer();

    const tags = String(
      f.tagsInput ??
        (Array.isArray(initial.tags) ? initial.tags.join(", ") : ""),
    )
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    await onSave({
      name: f.name.trim(),
      tags,
      barcode: String(f.barcode || "").trim(),
      category: (f.category || "").trim(),
      price,
      active: f.active !== false,
      sort: f.sort ?? Date.now(),
      offer,
    });
    setBusy(false);
  }

  /* live preview — exactly what the till will charge */
  const previewOffer =
    f.offer.type === OFFER_BULK
      ? {
          type: OFFER_BULK,
          tiers: f.offer.tiers.map((t) => ({
            qty: Number(t.qty) || 0,
            price: toSen(t.priceInput ?? toRMInput(t.price)),
          })),
        }
      : f.offer;

  const previewQtys =
    f.offer.type === OFFER_FREEBIE
      ? dedupe([
          1,
          Number(f.offer.buyQty) || 1,
          (Number(f.offer.buyQty) || 0) + (Number(f.offer.freeQty) || 0),
          (Number(f.offer.buyQty) || 0) + (Number(f.offer.freeQty) || 0) + 1,
          2 * ((Number(f.offer.buyQty) || 0) + (Number(f.offer.freeQty) || 0)),
        ])
      : dedupe([1, 2, 3, 4, 5, 6, 10, 12]);

  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" {...enter}>
        <h3>{isNew ? "Add product" : f.name}</h3>
        <p className="lede">
          Everything here shows up on the quick-add grid straight away, on both
          laptops.
        </p>

        <div className="row">
          <label className="field">
            <span>Name</span>
            <input
              value={f.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Price (RM)</span>
            <input
              className="mono"
              inputMode="decimal"
              value={f.priceInput}
              onChange={(e) => set("priceInput", e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Promotion tags — comma separated</span>
          <input
            className="mono"
            value={
              f.tagsInput ??
              (Array.isArray(initial.tags) ? initial.tags.join(", ") : "")
            }
            onChange={(e) => set("tagsInput", e.target.value)}
            placeholder="h2t600new, flavour:calming"
          />
        </label>
        <p className="lede" style={{ marginTop: -8 }}>
          These join a product to a multi-product promotion. Leave blank if it
          isn't in one. See PROMOTIONS.md for the tag each promotion expects.
        </p>

        <div className="row">
          <label className="field">
            <span>Category (groups the grid)</span>
            <input
              value={f.category || ""}
              onChange={(e) => set("category", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Barcode (optional)</span>
            <input
              className="mono"
              value={f.barcode || ""}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder="Scan into this box"
            />
          </label>
        </div>

        <label className="field">
          <span>Offer</span>
          <select
            value={f.offer.type}
            onChange={(e) => setOffer("type", e.target.value)}>
            <option value={OFFER_NONE}>No offer</option>
            <option value={OFFER_FREEBIE}>Buy X, get Y free</option>
            <option value={OFFER_BULK}>Bulk price (n for RM y)</option>
          </select>
        </label>

        {f.offer.type === OFFER_FREEBIE && (
          <div className="row">
            <label className="field">
              <span>Buy</span>
              <input
                className="mono"
                inputMode="numeric"
                value={f.offer.buyQty || ""}
                onChange={(e) => setOffer("buyQty", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Get free</span>
              <input
                className="mono"
                inputMode="numeric"
                value={f.offer.freeQty || ""}
                onChange={(e) => setOffer("freeQty", e.target.value)}
              />
            </label>
          </div>
        )}

        {f.offer.type === OFFER_BULK && (
          <div style={{ marginBottom: 12 }}>
            {f.offer.tiers.map((t, i) => (
              <div className="tierrow" key={i}>
                <label className="field" style={{ margin: 0 }}>
                  <span>Quantity</span>
                  <input
                    className="mono"
                    inputMode="numeric"
                    value={t.qty}
                    onChange={(e) => setTier(i, "qty", e.target.value)}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>For (RM)</span>
                  <input
                    className="mono"
                    inputMode="decimal"
                    value={t.priceInput ?? toRMInput(t.price)}
                    onChange={(e) => setTier(i, "priceInput", e.target.value)}
                  />
                </label>
                <button
                  className="linkbtn danger"
                  onClick={() => dropTier(i)}
                  style={{ marginTop: 18 }}>
                  Remove
                </button>
              </div>
            ))}
            <button className="btn" style={{ height: 40 }} onClick={addTier}>
              Add a bulk price
            </button>
          </div>
        )}

        <div className="preview mono">
          <h4>What the till will charge</h4>
          {previewQtys.map((q) => {
            const r = priceLine({
              unitPrice: price,
              qty: q,
              offer: previewOffer,
            });
            return (
              <div className="prow" key={q}>
                <span>
                  {q} × {formatRM(price)}
                  {r.saved > 0 && <em> — {r.note}</em>}
                </span>
                <span>
                  {r.saved > 0 && <s>{formatRM(r.gross)}</s>}
                  <b>{formatRM(r.total)}</b>
                </span>
              </div>
            );
          })}
        </div>

        <label
          style={{
            display: "flex",
            gap: 9,
            alignItems: "center",
            margin: "14px 0",
          }}>
          <input
            type="checkbox"
            checked={f.active !== false}
            onChange={(e) => set("active", e.target.checked)}
          />
          <span style={{ fontSize: 14 }}>Show on the quick-add grid</span>
        </label>

        <div className="actions">
          {!isNew && (
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || !f.name.trim()}
            onClick={save}>
            {busy ? "Saving…" : "Save product"}
          </button>
        </div>
      </div>
    </div>
  );
}

const dedupe = (a) =>
  [...new Set(a.filter((n) => n > 0))].sort((x, y) => x - y);

/* A starter catalogue shaped like a real fair stall, including one of each
   offer type so you can see them behave before the doors open. */
const SAMPLE = (() => {
  const p = (name, category, rm, offer = emptyOffer(), barcode = "") => ({
    name,
    category,
    price: Math.round(rm * 100),
    barcode,
    active: true,
    sort: Date.now() + Math.random(),
    offer,
  });
  const bulk = (...pairs) => ({
    type: OFFER_BULK,
    buyQty: 0,
    freeQty: 0,
    tiers: pairs.map(([qty, rm]) => ({ qty, price: Math.round(rm * 100) })),
  });
  const free = (buyQty, freeQty) => ({
    type: OFFER_FREEBIE,
    buyQty,
    freeQty,
    tiers: [],
  });

  return [
    p("Kaya puff", "Pastry", 3, bulk([3, 8], [6, 15])),
    p("Curry puff", "Pastry", 3, bulk([3, 8], [6, 15])),
    p("Egg tart", "Pastry", 3.5, bulk([4, 12])),
    p("Butter cake slice", "Pastry", 5),
    p("Pandan chiffon slice", "Pastry", 5),
    p("Swiss roll", "Pastry", 12, free(4, 1)),
    p("Pineapple tart jar", "Jars", 25, bulk([2, 45], [5, 105])),
    p("Peanut cookie jar", "Jars", 22, bulk([2, 40])),
    p("Almond london jar", "Jars", 28, bulk([2, 52])),
    p("Kuih bangkit jar", "Jars", 20, bulk([3, 55])),
    p("Iced kopi", "Drinks", 6),
    p("Iced teh tarik", "Drinks", 6),
    p("Kopi O", "Drinks", 4),
    p("Bottled water", "Drinks", 2, free(12, 1)),
    p("Soya bean", "Drinks", 5, bulk([3, 13])),
    p("Sugarcane juice", "Drinks", 7),
    p("Nasi lemak bungkus", "Food", 8, bulk([2, 15])),
    p("Mee goreng", "Food", 9),
    p("Satay (10 sticks)", "Food", 15, free(3, 1)),
    p("Otak-otak (5)", "Food", 10),
    p("Tote bag", "Merch", 35, bulk([2, 60])),
    p("Enamel mug", "Merch", 28),
    p("Sticker pack", "Merch", 8, free(5, 1)),
    p("Gift box (empty)", "Merch", 6),
  ];
})();
