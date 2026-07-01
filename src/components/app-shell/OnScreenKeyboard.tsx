import { useEffect, useRef, useState } from "react";
import { focusFirst } from "./spatialNav";
import { oskBackspace, oskInsert, oskMoveCaret, type TextField } from "./oskEdit";
import "./OnScreenKeyboard.css";

// Three key sets, matching the Aurora reference. Symbols/Accents each toggle
// back to letters. Every row is 10 wide so the grid never reflows.
const LETTERS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "-"],
  ["z", "x", "c", "v", "b", "n", "m", "_", "@", "."],
];
const SYMBOLS = [
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
  ["-", "_", "=", "+", "[", "]", "{", "}", "\\", "|"],
  [";", ":", "'", '"', ",", ".", "<", ">", "/", "?"],
  ["`", "~", "€", "£", "¥", "•", "–", "—", "…", "§"],
];
const ACCENTS = [
  ["á", "à", "â", "ä", "ã", "å", "é", "è", "ê", "ë"],
  ["í", "ì", "î", "ï", "ó", "ò", "ô", "ö", "õ", "ø"],
  ["ú", "ù", "û", "ü", "ñ", "ç", "ß", "æ", "œ", "ý"],
  ["Á", "É", "Í", "Ó", "Ú", "Ñ", "Ç", "Ü", "Ö", "Ä"],
];

type Mode = "letters" | "symbols" | "accents";

/** Best human label for the field being edited — shown as the modal title. */
function fieldLabel(el: TextField): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  try {
    if (el.id) {
      const lab = document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent?.trim()) return lab.textContent.trim();
    }
  } catch {
    /* invalid id selector — fall through */
  }
  const wrap = el.closest("label");
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  if (el.placeholder) return el.placeholder;
  return "Text entry";
}

/** Small gamepad-button badge. A/B/X/Y are colored; shoulder/trigger keys neutral. */
function Badge({ btn }: { btn: string }) {
  const kind = /^[ABXY]$/.test(btn) ? btn.toLowerCase() : "neutral";
  return <span className={`osk__badge osk__badge--${kind}`}>{btn}</span>;
}

/** Gamepad-driven on-screen keyboard. Keys are plain buttons, so the existing
 *  spatial nav (d-pad) walks them and A presses one. Opened from AppShell when a
 *  text field is activated in controller mode. Aurora "Change Gamertag" styling;
 *  edit logic is unchanged (oskEdit ops act on the real `target` field). */
export function OnScreenKeyboard({
  target,
  onClose,
}: {
  target: TextField;
  onClose: () => void;
}) {
  const [caps, setCaps] = useState(false);
  const [mode, setMode] = useState<Mode>("letters");
  // Live mirror of the field being edited: the modal covers the page, so the
  // user reads their text (and caret) here rather than in the hidden field.
  const [mirror, setMirror] = useState({ value: target.value, caret: target.value.length });
  const panelRef = useRef<HTMLDivElement>(null);

  const title = fieldLabel(target);
  const isPassword = target instanceof HTMLInputElement && target.type === "password";
  const isTextarea = target.tagName === "TEXTAREA";
  const max = target.maxLength > 0 ? target.maxLength : null;

  useEffect(() => {
    const grid = panelRef.current?.querySelector<HTMLElement>(".osk__grid .osk__key");
    if (grid) grid.focus();
    else if (panelRef.current) focusFirst(panelRef.current);
  }, []);

  // Reflect the real field's value + caret. `input` catches typing/backspace;
  // `selectionchange` catches caret moves (LB/RB set the selection, no input).
  useEffect(() => {
    const sync = () =>
      setMirror({ value: target.value, caret: target.selectionStart ?? target.value.length });
    sync();
    target.addEventListener("input", sync);
    document.addEventListener("selectionchange", sync);
    return () => {
      target.removeEventListener("input", sync);
      document.removeEventListener("selectionchange", sync);
    };
  }, [target]);

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

  const type = (ch: string) => {
    if (max !== null && target.value.length >= max) return; // honor the field's cap
    oskInsert(target, ch);
  };
  const backspace = () => oskBackspace(target);
  const moveCaret = (delta: number) => oskMoveCaret(target, delta);
  const toggleMode = (m: Mode) => setMode((cur) => (cur === m ? "letters" : m));

  const rows = mode === "symbols" ? SYMBOLS : mode === "accents" ? ACCENTS : LETTERS;
  const len = mirror.value.length;
  const shown = isPassword ? "•".repeat(len) : mirror.value;
  const caret = Math.min(mirror.caret, shown.length);

  return (
    <div className="osk" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
      <div className="osk__panel">
        <div className="osk__title">{title}</div>

        <div className="osk__field">
          <span className="osk__value">
            {shown.slice(0, caret)}
            <span className="osk__caret" />
            {shown.slice(caret)}
            {len === 0 && <span className="osk__placeholder">{target.placeholder || "Type here…"}</span>}
          </span>
          {max !== null && (
            <span className={`osk__counter${len >= max ? " is-full" : ""}`}>
              {len}/{max}
            </span>
          )}
        </div>

        <div className="osk__body">
          <div className="osk__rail">
            <button type="button" className="osk__key osk__key--rail" aria-label="Move caret left" onClick={() => moveCaret(-1)}>
              <Badge btn="LB" />
              <span className="osk__key-label">Cursor</span>
            </button>
            <button
              type="button"
              className={`osk__key osk__key--rail osk__key--symbols${mode === "symbols" ? " is-active" : ""}`}
              onClick={() => toggleMode("symbols")}
            >
              <Badge btn="LT" />
              <span className="osk__key-label">Symbols</span>
            </button>
            <button
              type="button"
              className={`osk__key osk__key--rail osk__key--caps${caps ? " is-active" : ""}`}
              onClick={() => setCaps((c) => !c)}
            >
              <Badge btn="L" />
              <span className="osk__key-label">Caps</span>
            </button>
          </div>

          <div className="osk__grid">
            {rows.map((row, ri) => (
              <div className="osk__grid-row" key={ri}>
                {row.map((ch, ci) => {
                  const label = caps && /[a-zà-ÿ]/.test(ch) ? ch.toUpperCase() : ch;
                  return (
                    <button type="button" className="osk__key" key={ci} onClick={() => type(label)}>
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className={`osk__action-row${isTextarea ? " osk__action-row--3" : ""}`}>
              <button type="button" className="osk__key osk__key--action" onClick={backspace}>
                <span className="osk__key-ico">⌫</span>Backspace
                <Badge btn="X" />
              </button>
              <button type="button" className="osk__key osk__key--action" onClick={() => type(" ")}>
                Space
                <Badge btn="Y" />
              </button>
              {isTextarea && (
                <button type="button" className="osk__key osk__key--action" aria-label="New line" onClick={() => type("\n")}>
                  <span className="osk__key-ico">⏎</span>Enter
                </button>
              )}
            </div>
          </div>

          <div className="osk__rail">
            <button type="button" className="osk__key osk__key--rail" aria-label="Move caret right" onClick={() => moveCaret(1)}>
              <Badge btn="RB" />
              <span className="osk__key-label">Cursor</span>
            </button>
            <button
              type="button"
              className={`osk__key osk__key--rail osk__key--accents${mode === "accents" ? " is-active" : ""}`}
              onClick={() => toggleMode("accents")}
            >
              <Badge btn="RT" />
              <span className="osk__key-label">Accents</span>
            </button>
            <button type="button" className="osk__key osk__key--rail osk__key--done" onClick={onClose}>
              <span className="osk__key-ico">▶</span>
              <span className="osk__key-label">Done</span>
            </button>
          </div>
        </div>
      </div>

      <div className="osk__footer">
        <span className="osk__footer-chip"><Badge btn="A" />Select</span>
        <span className="osk__footer-chip"><Badge btn="B" />Back</span>
      </div>
    </div>
  );
}
