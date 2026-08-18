import { useState } from "react";
import { signIn } from "../lib/auth";
import { useEnterNav } from "../lib/useEnterNav";

export default function Login() {
  const enter = useEnterNav();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await signIn(email, password);
    if (!r.ok) setError(r.message);
    setBusy(false);
  }

  return (
    <div className="scrim" style={{ background: "var(--canvas)" }}>
      <form className="modal" onSubmit={submit} {...enter}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" style={{ fontSize: 28 }}>
            SS FOO
          </span>
          <span className="brand-sub">Fair</span>
        </div>
        <h3>Sign in to the till</h3>
        <p className="lede">
          Accounts are created by an admin. There's no sign-up here on purpose.
        </p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoFocus
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p
            style={{
              color: "var(--amber)",
              fontSize: 13,
              lineHeight: 1.45,
              margin: "0 0 14px",
            }}>
            {error}
          </p>
        )}

        <div className="actions">
          <button
            className="btn primary"
            type="submit"
            disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="lede" style={{ margin: "16px 0 0", fontSize: 12 }}>
          Forgotten a password? An admin resets it in the Firebase console under
          Authentication.
        </p>
      </form>
    </div>
  );
}
