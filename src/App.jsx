import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
  Component,
} from 'react';
import { watchAuth, watchProfile, signOut, ROLES } from './lib/auth';
import { TILLS, getTill, setTill, watchProducts } from './lib/db';
import Login from './pages/Login';
import Sell from './pages/Sell';
import Admin from './pages/Admin';
import Report from './pages/Report';
import Users from './pages/Users';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export default function App() {
  return (
    <Boundary>
      <Gate />
    </Boundary>
  );
}

/* Sign-in and profile come first. Everything past this point can assume there
   is a real person with a role attached. */
function Gate() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(undefined); // undefined = loading
  const [error, setError] = useState(null);

  useEffect(
    () =>
      watchAuth((u) => {
        setUser(u);
        setChecked(true);
        if (!u) setProfile(undefined);
      }, setError),
    []
  );

  useEffect(() => {
    if (!user) return;
    return watchProfile(user.uid, setProfile, setError);
  }, [user]);

  if (error) return <Problem message={error} />;
  if (!checked) return <Splash>Connecting to Firebase…</Splash>;
  if (!user) return <Login />;
  if (profile === undefined) return <Splash>Checking your account…</Splash>;
  if (profile === null) return <NoProfile uid={user.uid} email={user.email} />;

  // The rules are stricter than the app can be. Check the profile against what
  // the rules actually demand, so a mismatch is named rather than guessed at.
  const issues = checkProfile(profile);
  if (issues.length) return <BadProfile uid={user.uid} profile={profile} issues={issues} />;

  if (profile.active === false) return <Blocked name={profile.name} />;

  return <Till me={profile} />;
}

/** Exactly the conditions firestore.rules enforces. */
function checkProfile(p) {
  const out = [];
  const t = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

  if (typeof p.active !== 'boolean') {
    out.push({
      field: 'active',
      found: p.active === undefined ? 'missing' : `${t(p.active)} — ${JSON.stringify(p.active)}`,
      want: 'boolean true',
      how: 'Delete the field, add it again, and pick boolean from the type dropdown before saving.',
    });
  }
  if (p.role !== 'admin' && p.role !== 'user') {
    out.push({
      field: 'role',
      found: p.role === undefined ? 'missing' : `${t(p.role)} — ${JSON.stringify(p.role)}`,
      want: 'the string admin or user, lower case',
      how: 'Watch for a capital letter or a trailing space.',
    });
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    out.push({
      field: 'name',
      found: p.name === undefined ? 'missing' : `${t(p.name)} — ${JSON.stringify(p.name)}`,
      want: 'a string, your name',
      how: 'Only used for the receipt and the top bar.',
    });
  }
  return out;
}

function BadProfile({ uid, profile, issues }) {
  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="modal">
        <h3>Your staff profile needs fixing</h3>
        <p className="lede">
          The login works, but the document below doesn't match what the
          security rules expect, so Firestore refuses every read.
        </p>

        <label className="field">
          <span>Firebase console → Firestore → users → this document</span>
          <input className="mono" readOnly value={uid} onFocus={(e) => e.target.select()} />
        </label>

        {issues.map((i) => (
          <div className="preview" key={i.field} style={{ marginBottom: 10 }}>
            <h4>{i.field}</h4>
            <div className="prow">
              <span style={{ color: 'var(--text-dim)' }}>Found</span>
              <span className="mono" style={{ color: 'var(--amber)' }}>{i.found}</span>
            </div>
            <div className="prow">
              <span style={{ color: 'var(--text-dim)' }}>Needs to be</span>
              <span className="mono" style={{ color: 'var(--teal-lit)' }}>{i.want}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {i.how}
            </p>
          </div>
        ))}

        <p className="lede" style={{ marginTop: 14 }}>
          Fix it in the console, then reload. The rest of the document reads:
        </p>
        <pre
          className="mono"
          style={{
            background: 'var(--canvas)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: 'var(--text-dim)',
            overflowX: 'auto',
            margin: '0 0 14px',
          }}
        >
{JSON.stringify(
  Object.fromEntries(Object.entries(profile).filter(([k]) => k !== 'uid')),
  null,
  2
)}
        </pre>

        <div className="actions">
          <button className="btn danger" onClick={signOut}>
            Sign out
          </button>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

function Till({ me }) {
  const [till, setTillState] = useState(getTill);
  const [products, setProducts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('sell');
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => watchProducts(setProducts, setLoadError), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const notify = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  if (!till) {
    return (
      <PickTill
        onPick={(id) => {
          setTill(id);
          setTillState(TILLS[id]);
        }}
      />
    );
  }
  if (loadError) return <Problem message={loadError} />;
  if (!products) return <Splash slow>Loading products…</Splash>;

  const isAdmin = me.role === 'admin';
  const tabs = [
    ['sell', 'Sell'],
    ['admin', 'Products'],
    ['report', 'Sales'],
    ...(isAdmin ? [['users', 'Staff']] : []),
  ];

  return (
    <ToastCtx.Provider value={notify}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">SS FOO</span>
            <span className="brand-sub">Fair</span>
          </div>
          <span className="pill">{till.name}</span>
          <nav className="tabs">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                className="tab"
                aria-current={view === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="spacer" />
          <span className="pill">
            <i className={online ? 'dot' : 'dot off'} />
            {online ? 'Online' : 'Offline — sales are saved'}
          </span>
          <span className="pill">
            {me.name}
            <span className="tag" style={{ marginLeft: 2 }}>
              {ROLES[me.role]?.label || me.role}
            </span>
          </span>
          <button className="linkbtn" style={{ color: 'var(--text-dim)' }} onClick={signOut}>
            Sign out
          </button>
        </header>

        {view === 'sell' && <Sell products={products} till={till} me={me} />}
        {view === 'admin' && <Admin products={products} />}
        {view === 'report' && <Report till={till} />}
        {view === 'users' && isAdmin && <Users me={me} />}
      </div>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={t.tone === 'warn' ? 'toast warn' : 'toast'}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- account states ---------- */

/** Shown to the very first admin, before any profile exists in Firestore. */
function NoProfile({ uid, email }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="modal">
        <h3>This login has no profile yet</h3>
        <p className="lede">
          The login works, but nobody has said who you are or what you're allowed
          to do. An admin creates that under Staff. If you're setting up the
          first admin, do it once by hand:
        </p>

        <ol
          style={{
            color: 'var(--text-dim)',
            fontSize: 13,
            lineHeight: 1.7,
            paddingLeft: 18,
            margin: '0 0 16px',
          }}
        >
          <li>Firebase console → Firestore Database</li>
          <li>
            Start a collection called <b style={{ color: 'var(--text)' }}>users</b>
          </li>
          <li>Document ID: paste the ID below</li>
          <li>
            Add fields — <b style={{ color: 'var(--text)' }}>name</b> (string),{' '}
            <b style={{ color: 'var(--text)' }}>email</b> (string),{' '}
            <b style={{ color: 'var(--text)' }}>role</b> (string, set to{' '}
            <b style={{ color: 'var(--text)' }}>admin</b>),{' '}
            <b style={{ color: 'var(--text)' }}>active</b> (boolean, true)
          </li>
          <li>Come back here and reload</li>
        </ol>

        <label className="field">
          <span>Your document ID</span>
          <input className="mono" readOnly value={uid} onFocus={(e) => e.target.select()} />
        </label>
        <label className="field">
          <span>Your email</span>
          <input className="mono" readOnly value={email || ''} />
        </label>

        <div className="actions">
          <button className="btn danger" onClick={signOut}>
            Sign out
          </button>
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(uid);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied' : 'Copy ID'}
          </button>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

function Blocked({ name }) {
  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="modal">
        <h3>Account blocked</h3>
        <p className="lede">
          {name}, this account has been switched off. Ask an admin to unblock it
          under Staff.
        </p>
        <div className="actions">
          <button className="btn primary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- states that used to be a white screen ---------- */

class Boundary extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('Till crashed:', err, info);
  }
  render() {
    if (this.state.err) return <Problem message={this.state.err.message} crash />;
    return this.props.children;
  }
}

function Problem({ message, crash }) {
  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="modal">
        <h3>{crash ? 'The till hit an error' : 'The till cannot start'}</h3>
        <p className="lede" style={{ marginBottom: 14 }}>
          {message}
        </p>
        <p className="lede" style={{ marginBottom: 14 }}>
          Full details are in the browser console (F12 → Console).
        </p>
        <div className="actions">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

/* If a splash sits there for more than a few seconds something is wrong, so
   say so rather than spinning silently forever. */
function Splash({ children, slow }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!slow) return;
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, [slow]);

  if (stuck) {
    return (
      <Problem
        message={
          'Firestore has not answered in six seconds. If the Sales rules are ' +
          'published and you are online, check your document in the users ' +
          'collection: active must be a boolean true, not the text "true", ' +
          'and role must be exactly admin or user in lower case. The browser ' +
          'console (F12) has the underlying error.'
        }
      />
    );
  }

  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="splash">
        <div className="brand">
          <span className="brand-mark">SS FOO</span>
          <span className="brand-sub">Fair</span>
        </div>
        <div className="bar">
          <i />
        </div>
        <p>{children}</p>
      </div>
    </div>
  );
}

function PickTill({ onPick }) {
  return (
    <div className="scrim" style={{ background: 'var(--canvas)' }}>
      <div className="modal">
        <h3>Which laptop is this?</h3>
        <p className="lede">
          Picked once per machine. It decides which payment methods this till
          offers and where its receipt numbers come from.
        </p>
        {Object.values(TILLS).map((t) => (
          <button
            key={t.id}
            className="btn"
            style={{ width: '100%', marginBottom: 10, height: 64 }}
            onClick={() => onPick(t.id)}
          >
            {t.name} — takes {t.methods.join(' and ')}
          </button>
        ))}
      </div>
    </div>
  );
}
