/**
 * Cash drawer.
 *
 * The browser can't talk to the print spooler, so a helper runs on the Windows
 * laptop (see /helper) and sends `CASHDRAWER 0,32,32` to the XP-370B as a RAW
 * job. That takes a second or two, because PowerShell compiles the interop
 * shim on each call.
 *
 * Rule: a drawer failure is never allowed to block or delay a sale. This is
 * called AFTER the sale is recorded and the cart cleared, and nothing awaits
 * it, so the generous timeout below only affects how long we wait before
 * showing a warning — never the cashier.
 */

const URL = import.meta.env.VITE_DRAWER_URL || "http://localhost:9110/drawer";
const TIMEOUT_MS = 9000;

export async function openDrawer(reason = "cash sale") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "CASHDRAWER 0,32,32", reason }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`helper returned ${res.status}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message:
        e.name === "AbortError"
          ? "Drawer did not answer in time. Open it with the key."
          : "Drawer helper is not running. Start start-drawer-helper.bat, " +
            "or open the drawer with the key.",
    };
  } finally {
    clearTimeout(timer);
  }
}
