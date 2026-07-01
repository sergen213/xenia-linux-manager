// Pure text-field edit ops shared by the on-screen keyboard keys and AppShell's
// gamepad loop (which drives X=Backspace, Y=Space, LB/RB=caret straight from
// controller buttons). Kept out of OnScreenKeyboard.tsx so that file only exports
// a component (Fast Refresh requirement). Each op acts at the caret / selection.

export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Place the caret without letting the field grab focus. In Blink, setSelectionRange
 *  focuses the input it's called on — which yanks focus off the on-screen keyboard
 *  key that was pressed, killing its focus ring and spatial-nav position until the
 *  next d-pad move. Restore whatever had focus (the OSK key). */
function setCaret(el: TextField, pos: number) {
  const prev = document.activeElement;
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    return; // some input types disallow selection ranges — harmless
  }
  if (prev instanceof HTMLElement && prev !== el && document.activeElement === el) prev.focus();
}

/** Apply `mutate(value, start, end) -> [next, caret]` to a (possibly React-
 *  controlled) field via the native value setter + an input event, so React's
 *  onChange fires, then place the caret. */
function editTarget(el: TextField, mutate: (v: string, start: number, end: number) => [string, number]) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const [next, caret] = mutate(el.value, start, end);
  setter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  setCaret(el, caret);
}

export function oskInsert(el: TextField, text: string) {
  editTarget(el, (v, s, e) => [v.slice(0, s) + text + v.slice(e), s + text.length]);
}

export function oskBackspace(el: TextField) {
  editTarget(el, (v, s, e) =>
    s === e ? [v.slice(0, Math.max(0, s - 1)) + v.slice(e), Math.max(0, s - 1)] : [v.slice(0, s) + v.slice(e), s],
  );
}

/** Apply the field the way finishing on a real keyboard would. The on-screen
 *  keys only mutate the value; the surrounding editor still applies that value on
 *  its own trigger — a Save form-submit (GameIdentityEditor, Settings) or an Enter
 *  keypress (ProfileEditor create/rename). Without this the typed text sits in the
 *  box unapplied when the user presses Done.
 *  ponytail: covers this app's two commit patterns (form submit + onKeyDown Enter);
 *  a blur-only field would need an `el.blur()` added here. Form fields go through
 *  requestSubmit only (no synthetic Enter) so nothing double-commits. */
export function oskCommit(el: TextField) {
  if (el.form) {
    el.form.requestSubmit();
    return;
  }
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true, cancelable: true }));
}

/** Step the caret. A selection collapses to its near edge first; no input event
 *  since the value is unchanged — insert/backspace read selectionStart directly. */
export function oskMoveCaret(el: TextField, delta: number) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  const pos = s !== e ? (delta < 0 ? s : e) : Math.max(0, Math.min(el.value.length, s + delta));
  setCaret(el, pos);
}
