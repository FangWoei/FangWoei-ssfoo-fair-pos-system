import { useEffect, useState } from "react";
import { useToast } from "../App";
import {
  createAccount,
  renameUser,
  ROLES,
  setUserActive,
  setUserRole,
  watchUsers,
} from "../lib/auth";
import { useEnterNav } from "../lib/useEnterNav";

export default function Users({ me }) {
  const notify = useToast();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => watchUsers(setUsers, setError), []);

  const admins = users.filter((u) => u.role === "admin" && u.active !== false);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Staff</h1>
        <span className="pill">{users.length} accounts</span>
        <div className="spacer" />
        <button
          className="btn primary"
          style={{ flex: "0 0 auto", padding: "0 20px" }}
          onClick={() => setAdding(true)}>
          Create account
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--amber)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isMe = u.uid === me.uid;
            const lastAdmin = u.role === "admin" && admins.length === 1;
            return (
              <tr key={u.uid}>
                <td>
                  {u.name}
                  {isMe && (
                    <span className="tag" style={{ marginLeft: 8 }}>
                      you
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--text-dim)" }}>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={isMe || lastAdmin}
                    onChange={async (e) => {
                      await setUserRole(u.uid, e.target.value);
                      notify(`${u.name} is now ${ROLES[e.target.value].label}`);
                    }}
                    style={{
                      background: "var(--canvas)",
                      border: "1px solid var(--line)",
                      color: "var(--text)",
                      borderRadius: 7,
                      padding: "5px 8px",
                    }}>
                    <option value="user">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  {u.active === false ? (
                    <span className="tag off">Blocked</span>
                  ) : (
                    <span className="tag">Active</span>
                  )}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    className="linkbtn"
                    style={{ color: "var(--text-dim)", marginRight: 12 }}
                    onClick={async () => {
                      const name = prompt("Name", u.name);
                      if (name?.trim()) {
                        await renameUser(u.uid, name);
                        notify("Name updated");
                      }
                    }}>
                    Rename
                  </button>
                  <button
                    className={
                      u.active === false ? "linkbtn" : "linkbtn danger"
                    }
                    disabled={isMe || lastAdmin}
                    style={{ opacity: isMe || lastAdmin ? 0.35 : 1 }}
                    onClick={async () => {
                      await setUserActive(u.uid, u.active === false);
                      notify(
                        u.active === false
                          ? `${u.name} can sign in again`
                          : `${u.name} is blocked`,
                      );
                    }}>
                    {u.active === false ? "Unblock" : "Block"}
                  </button>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--text-dim)" }}>
                No accounts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          lineHeight: 1.55,
          marginTop: 18,
          maxWidth: 640,
        }}>
        Blocking stops someone using the till straight away, on both laptops,
        even if they're mid-shift. It doesn't delete their login — for that, and
        for password resets, use the Firebase console under Authentication.
      </p>

      {adding && (
        <NewAccount
          onClose={() => setAdding(false)}
          onDone={(msg) => {
            notify(msg);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function NewAccount({ onClose, onDone }) {
  const enter = useEnterNav();
  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true);
    setError("");
    const r = await createAccount(f);
    setBusy(false);
    if (r.ok) onDone(`${f.name} can now sign in`);
    else setError(r.message);
  }

  const suggest = () =>
    set(
      "password",
      Math.random().toString(36).slice(2, 6) +
        Math.random().toString(36).slice(2, 6),
    );

  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" {...enter}>
        <h3>Create account</h3>
        <p className="lede">
          You'll stay signed in as yourself. Write the password down and hand it
          over — nobody can recover it from here afterwards.
        </p>

        <label className="field">
          <span>Name shown on the till</span>
          <input
            value={f.name}
            autoFocus
            onChange={(e) => set("name", e.target.value)}
          />
        </label>

        <label className="field">
          <span>Email used to sign in</span>
          <input
            type="email"
            value={f.email}
            placeholder="ali@ssfoo.fair"
            onChange={(e) => set("email", e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password — 6 characters or more</span>
          <input
            className="mono"
            value={f.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </label>
        <button
          className="linkbtn"
          onClick={suggest}
          style={{
            color: "var(--text-dim)",
            marginBottom: 14,
            display: "block",
          }}>
          Suggest one
        </button>

        <label className="field">
          <span>Role</span>
          <select value={f.role} onChange={(e) => set("role", e.target.value)}>
            <option value="user">Cashier</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <p className="lede" style={{ marginTop: -6 }}>
          {ROLES[f.role].blurb}
        </p>

        {error && (
          <p style={{ color: "var(--amber)", fontSize: 13, lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        <div className="actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
