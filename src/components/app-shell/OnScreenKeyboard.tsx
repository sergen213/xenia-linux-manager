import { useEffect, useRef, useState } from "react";
import { focusFirst } from "./spatialNav";
import "./OnScreenKeyboard.css";

/** Insert `text` at the caret of a React-controlled input/textarea. Uses the
 *  native value setter + an input event so React's onChange fires. */
function editTarget(el: HTMLInputElement | HTMLTextAreaElement, mutate: (v: string, start: number, end: number) => [string, number]) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const [next, caret] = mutate(el.value, start, end);
  setter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    // some input types disallow selection ranges — harmless
  }
}

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
  ["=", "_", "-", "/", ".", ":", ",", "\""],
];

/** Gamepad-driven on-screen keyboard. Keys are plain buttons, so the existing
 *  spatial nav (d-pad) walks them and A presses one. Opened from AppShell when a
 *  text field is activated in controller mode. */
export function OnScreenKeyboard({
  target,
  onClose,
}: {
  target: HTMLInputElement | HTMLTextAreaElement;
  onClose: () => void;
}) {
  const [caps, setCaps] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) focusFirst(panelRef.current);
  }, []);

  // Escape closes; capture + stop so AppShell's global Escape doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const type = (ch: string) =>
    editTarget(target, (v, s, e) => [v.slice(0, s) + ch + v.slice(e), s + ch.length]);

  const backspace = () =>
    editTarget(target, (v, s, e) =>
      s === e ? [v.slice(0, Math.max(0, s - 1)) + v.slice(e), Math.max(0, s - 1)] : [v.slice(0, s) + v.slice(e), s],
    );

  const enter = () => {
    if (target.tagName === "TEXTAREA") type("\n");
    else onClose(); // single-line field: Enter = done
  };

  return (
    <div className="osk" ref={panelRef} role="dialog" aria-label="On-screen keyboard">
      {ROWS.map((row, i) => (
        <div className="osk__row" key={i}>
          {row.map((ch) => {
            const label = caps && /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
            return (
              <button type="button" className="osk__key" key={ch} onClick={() => type(label)}>
                {label}
              </button>
            );
          })}
        </div>
      ))}
      <div className="osk__row osk__row--controls">
        <button
          type="button"
          className={`osk__key osk__key--wide${caps ? " is-active" : ""}`}
          onClick={() => setCaps((c) => !c)}
        >
          ⇧ Caps
        </button>
        <button type="button" className="osk__key osk__key--space" onClick={() => type(" ")}>
          Space
        </button>
        <button type="button" className="osk__key osk__key--wide" onClick={backspace}>
          ⌫ Back
        </button>
        <button type="button" className="osk__key osk__key--wide" onClick={enter}>
          ⏎ Enter
        </button>
        <button type="button" className="osk__key osk__key--wide osk__key--done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
