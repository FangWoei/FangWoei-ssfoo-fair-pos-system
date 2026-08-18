import { useRef } from "react";

/**
 * Enter walks forward through a form.
 *
 * Every field in turn, then the primary button — where Enter fires it, because
 * that is what Enter already does on a focused button. Cancel and other
 * secondary buttons are skipped: stopping on a destructive control on the way
 * to Save is how a rushed cashier loses their work.
 *
 * Stopping on the button rather than saving straight from the last field is
 * deliberate. It gives one beat to see what is about to happen, and it means
 * Enter never does something different depending on which field you happen to
 * be in.
 *
 * Usage:
 *
 *     const enter = useEnterNav();
 *     <div {...enter}> …fields… <button className="btn primary">Save</button> </div>
 *
 * Shift+Enter walks backwards. Textareas are left alone so multi-line input
 * still works.
 */
export function useEnterNav() {
  const ref = useRef(null);

  function onKeyDown(e) {
    if (e.key !== "Enter" || !ref.current) return;

    const el = e.target;
    if (el.tagName === "TEXTAREA") return;
    // On a button, let the browser click it — that is the end of the walk.
    if (el.tagName === "BUTTON") return;

    e.preventDefault();

    const fields = [
      ...ref.current.querySelectorAll(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled])',
      ),
    ].filter((f) => f.offsetParent !== null);

    const primary = ref.current.querySelector(".btn.primary:not([disabled])");
    const stops = primary ? [...fields, primary] : fields;

    const i = stops.indexOf(el);
    if (i === -1) return;

    const next = e.shiftKey ? stops[i - 1] : stops[i + 1];
    if (!next) {
      // Past the end with nothing to focus: submit if we can.
      primary?.click();
      return;
    }

    next.focus();
    if (typeof next.select === "function" && next.tagName === "INPUT") {
      // Selecting means the next keystroke replaces the value rather than
      // appending to it, which is what you want when correcting a price.
      next.select();
    }
  }

  return { ref, onKeyDown };
}
