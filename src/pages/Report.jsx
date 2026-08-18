import { useEffect, useMemo, useState } from 'react';
import { watchSalesSince, METHODS } from '../lib/db';
import { formatRM } from '../lib/pricing';
import Receipt from '../components/Receipt';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const fairStart = () => new Date(Date.now() - 5 * 864e5);

export default function Report() {
  const [scope, setScope] = useState('today');
  const [sales, setSales] = useState([]);
  const [reprint, setReprint] = useState(null);
  const [error, setError] = useState('');

  useEffect(
    () =>
      watchSalesSince(
        scope === 'today' ? startOfToday() : fairStart(),
        setSales,
        setError
      ),
    [scope]
  );

  useEffect(() => {
    if (!reprint) return;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [reprint]);

  const s = useMemo(() => {
    const byMethod = {};
    const byProduct = {};
    let total = 0;
    let saved = 0;
    for (const sale of sales) {
      total += sale.total || 0;
      saved += sale.saved || 0;
      byMethod[sale.method] = (byMethod[sale.method] || 0) + (sale.total || 0);
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
      top: Object.entries(byProduct)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10),
    };
  }, [sales]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sales</h1>
        <div className="tabs">
          {[
            ['today', 'Today'],
            ['fair', 'Whole fair'],
          ].map(([id, label]) => (
            <button key={id} className="tab" aria-current={scope === id} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--amber)', fontSize: 13, marginBottom: 16, maxWidth: 640, lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <div className="stats">
        <div className="stat" style={{ '--chip': 'var(--marigold)' }}>
          <small>Takings</small>
          <b className="figure">{formatRM(s.total)}</b>
        </div>
        <div className="stat" style={{ '--chip': 'var(--sky)' }}>
          <small>Sales</small>
          <b className="figure">{sales.length}</b>
        </div>
        <div className="stat" style={{ '--chip': 'var(--jade)' }}>
          <small>Given away in offers</small>
          <b className="figure">{formatRM(s.saved)}</b>
        </div>
        {Object.keys(METHODS).map((m) =>
          s.byMethod[m] ? (
            <div className="stat" key={m} style={{ '--chip': `var(--pay-${m})` }}>
              <small>{METHODS[m].label}</small>
              <b className="figure">{formatRM(s.byMethod[m])}</b>
            </div>
          ) : null
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
                <th style={{ textAlign: 'right' }}>Takings</th>
              </tr>
            </thead>
            <tbody>
              {s.top.map(([name, v]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="mono">{v.qty}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
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
            <th>Items</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td className="mono">{sale.receiptNo}</td>
              <td className="mono" style={{ color: 'var(--text-dim)' }}>
                {sale.localAt?.toDate
                  ? sale.localAt.toDate().toLocaleTimeString('en-MY', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </td>
              <td style={{ color: 'var(--text-dim)' }}>{sale.till}</td>
              <td style={{ color: 'var(--text-dim)' }}>{sale.cashierName || '—'}</td>
              <td>{METHODS[sale.method]?.label || sale.method}</td>
              <td className="mono">{sale.qty}</td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {formatRM(sale.total)}
              </td>
              <td style={{ textAlign: 'right' }}>
                <button
                  className="linkbtn"
                  style={{ color: 'var(--text-dim)' }}
                  onClick={() =>
                    setReprint({
                      ...sale,
                      at: sale.localAt?.toDate ? sale.localAt.toDate() : Date.now(),
                    })
                  }
                >
                  Reprint
                </button>
              </td>
            </tr>
          ))}
          {sales.length === 0 && (
            <tr>
              <td colSpan={8} style={{ color: 'var(--text-dim)' }}>
                No sales in this period yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Receipt sale={reprint} />
    </div>
  );
}
