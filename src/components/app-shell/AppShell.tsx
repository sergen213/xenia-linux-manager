import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { AuroraField } from "../aurora/AuroraField";
import { BladeNav } from "../aurora/BladeNav";
import { LegendBar, LEGEND_COLORS, type LegendItem } from "../aurora/LegendBar";
import { WindowControls } from "../aurora/WindowControls";
import { useAuroraPrefs, clampZoom, ZOOM_STEP } from "../../theme/auroraPrefs";
import {
  selectVisibleLibraryCards,
  useLibrary,
  type LibraryState,
} from "../../features/library/state/libraryStore";
import type { LibraryAction } from "../../features/library/state/libraryStore";
import { SORT_LABELS, SORT_NEXT } from "../../features/library/components/aurora/LibraryLayouts";
import { activateFocused, focusFirst, moveFocus, rememberFocus, rotateActiveCase, scrollActiveRegion, spinHomeActiveCase, type Dir } from "./spatialNav";
import { useGamepad } from "./useGamepad";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
import { oskInsert, oskBackspace, oskMoveCaret, oskCommit } from "./oskEdit";
import { UpdateBanner } from "./UpdateBanner";
import { windowClose } from "../../platform/bridge";
import "./AppShell.css";

type TextField = HTMLInputElement | HTMLTextAreaElement;
const TEXT_INPUT_TYPES = ["text", "search", "url", "email", "tel", "password", "number", ""];
function asTextField(el: Element | null): TextField | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(el.type)) return el;
  return null;
}

/** Tab order for [ / ] and LB/RB cycling (matches the blade nav). */
const TAB_ORDER = ["/home", "/", "/saves", "/settings"];

/** Live column count of the rendered grid wall. The grid's column count is
 *  dynamic (LibraryGridWall derives it from width + zoom), so a hardcoded stride
 *  makes up/down jump to the wrong cell — read the real value off the DOM.
 *  Returns 1 when no grid is on screen (rail/blade views), so `grid = stride > 1`
 *  still discriminates grid mode. */
function gridStride(): number {
  const el = document.querySelector<HTMLElement>(".aurora-grid");
  if (!el) return 1;
  const cols = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(1, cols);
}

interface ShellRefData {
  pathname: string;
  navigate: NavigateFunction;
  state: LibraryState;
  dispatch: (action: LibraryAction) => void;
  applyZoom: (delta: number) => void;
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { prefs, setPref } = useAuroraPrefs();
  const { state, dispatch } = useLibrary();
  // The text field the on-screen keyboard is editing (controller typing), or null.
  const oskTarget = useRef<TextField | null>(null);
  const [oskOpen, setOskOpen] = useState(false);
  // Which device drove the last input — picks the legend variant so the bottom
  // bar shows controller glyphs OR keyboard shortcuts (not both, which overflows
  // the row at 720p). A pad connected at mount defaults to glyphs.
  const [inputMode, setInputMode] = useState<"pad" | "key">(() =>
    typeof navigator !== "undefined" &&
    navigator.getGamepads &&
    [...navigator.getGamepads()].some(Boolean)
      ? "pad"
      : "key",
  );
  const inputModeRef = useRef(inputMode);
  const markInput = (m: "pad" | "key") => {
    if (inputModeRef.current === m) return;
    inputModeRef.current = m;
    setInputMode(m);
  };
  const openOsk = (el: TextField) => {
    oskTarget.current = el;
    setOskOpen(true);
  };
  const closeOsk = () => {
    const t = oskTarget.current;
    setOskOpen(false);
    // Return focus to the field so spatial nav resumes there — except the hidden
    // library search proxy, which lives off-screen; let the reel take over instead.
    if (t && !t.classList.contains("aurora-library__search-input")) t.focus();
  };
  // Bottom-legend Search (and the "/" key / gamepad X on Library): open the
  // on-screen keyboard on the off-screen library search field.
  const openSearch = () => {
    const el = document.querySelector<HTMLInputElement>(".aurora-library__search-input");
    if (el) openOsk(el);
  };

  // Latest values for the always-mounted key/gamepad listeners (so they don't
  // re-subscribe on every selection change).
  const ref = useRef<ShellRefData>({
    pathname,
    navigate,
    state,
    dispatch,
    applyZoom: () => {},
  });
  // Keep the latest values available to the mount-once key/gamepad listeners.
  useEffect(() => {
    ref.current = {
      pathname,
      navigate,
      state,
      dispatch,
      applyZoom: (delta: number) =>
        setPref("zoom", clampZoom(prefs.zoom + delta * ZOOM_STEP)),
    };
  });

  const onLibrary = pathname === "/";
  const onGame = onLibrary || pathname === "/home";

  // Which "plane" the card-view directional input steers: the game reel (its own
  // index nav) or the surrounding chrome (top bar / tabs, via DOM focus).
  const plane = useRef<"reel" | "chrome">("reel");

  // ── Region + roots ────────────────────────────────────────────────────
  // The library reel runs index nav; everything else (pages, Sources, the
  // Details modal) is steered by DOM focus. cardView == a reel is on screen.
  function cardView(d: ShellRefData): boolean {
    return (
      d.pathname === "/" &&
      !d.state.detailsOpen &&
      selectVisibleLibraryCards(d.state).length > 0
    );
  }
  // An open menu/modal traps nav so the d-pad can't wander onto what's behind it.
  // Innermost wins: the CustomSelect menu portals to <body> (it isn't a DOM child
  // of .custom-select, so match it directly), then the nested unsaved-changes
  // dialog beats the details panel it lives inside, then any modal panel.
  const navRoot = (): ParentNode =>
    document.querySelector(".osk") ??
    document.querySelector(".custom-select__menu") ??
    document.querySelector(".unsaved-dialog") ??
    document.querySelector(".aurora-modal__panel, .xenia-dialog") ??
    document.querySelector(".app-shell") ??
    document;
  // True while an overlay (on-screen keyboard, open dropdown, any modal panel —
  // Details or the folder picker — dialog, or lightbox) owns input. Global
  // tab/navigation shortcuts (LB/RB, the page-jump buttons, zoom, sort) must not
  // leak to the screen behind it. Pure DOM check so the mount-once key/gamepad
  // listeners always see live state.
  const inputTrapped = () =>
    !!document.querySelector(
      ".osk, .custom-select.is-open, .aurora-modal__panel, .xenia-dialog, .aurora-lightbox",
    );
  const reelEl = () =>
    document.querySelector(".aurora-grid, .aurora-carousel");
  // The screenshot lightbox (body portal, above the details modal) traps input
  // while open: it owns no listeners itself, so we drive its on-screen nav/close
  // buttons here — d-pad/arrows flip screenshots, A/B/Esc dismiss it.
  const lightboxEl = () => document.querySelector(".aurora-lightbox");
  const clickSel = (sel: string) =>
    (document.querySelector(sel) as HTMLElement | null)?.click();
  // Show focus rings only while steering by controller/keyboard, not for mouse.
  const usingController = () => document.body.classList.add("using-controller");

  // ── Imperative actions (read latest via ref) ──────────────────────────
  function cycleTab(dir: number) {
    if (inputTrapped()) return; // don't switch background tabs behind a modal/menu/keyboard
    const { pathname: p, navigate: nav } = ref.current;
    let i = TAB_ORDER.indexOf(p);
    if (i < 0) i = 1;
    i = (i + dir + TAB_ORDER.length) % TAB_ORDER.length;
    nav(TAB_ORDER[i]);
  }

  // Zoom the Library covers (controller LT/RT, keyboard -/=, legend chips).
  // Only acts while a card reel is on screen so it never fires off-Library.
  function zoomLib(delta: number) {
    const d = ref.current;
    if (!inputTrapped() && cardView(d)) d.applyZoom(delta);
  }

  // Cycle the Library sort order (legend chip / keyboard S / L3). Only acts while
  // a card reel is on screen so it never fires off-Library.
  function cycleSort() {
    const d = ref.current;
    if (!inputTrapped() && cardView(d)) d.dispatch({ type: "SET_SORT", sortMode: SORT_NEXT[d.state.sortMode] });
  }

  // Scroll the focused menu a chunk (legend chip / PageUp-Down) — the keyboard
  // + click counterpart to the right-stick analog scroll.
  function scrollMenu(dir: number) {
    scrollActiveRegion(dir * 280);
  }

  function moveSel(dx: number, dy: number) {
    const d = ref.current;
    const cards = selectVisibleLibraryCards(d.state);
    if (!cards.length) return;
    let i = cards.findIndex((c) => c.game_id === d.state.selectedGameId);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(cards.length - 1, i + dx + dy * (dy ? gridStride() : 1)));
    d.dispatch({ type: "SELECT_GAME", gameId: cards[i].game_id });
  }

  // Directional input — routes to reel index nav or DOM spatial nav.
  function steer(dir: Dir) {
    usingController();
    // Lightbox open: left/right browse screenshots; up/down do nothing.
    if (lightboxEl()) {
      if (dir === "left") clickSel(".aurora-lightbox__nav--prev");
      else if (dir === "right") clickSel(".aurora-lightbox__nav--next");
      return;
    }
    // Any other overlay (on-screen keyboard, dropdown, modal): steer only within
    // it — never let the reel re-enter logic hijack the d-pad off the overlay (the
    // on-screen keyboard sits over the library reel, where cardView is still true).
    if (inputTrapped()) {
      moveFocus(dir, navRoot());
      return;
    }
    const d = ref.current;
    if (cardView(d) && plane.current === "reel") {
      const stride = gridStride();
      const grid = stride > 1;
      const sel = Math.max(
        0,
        selectVisibleLibraryCards(d.state).findIndex(
          (c) => c.game_id === d.state.selectedGameId,
        ),
      );
      if (dir === "left") return moveSel(-1, 0);
      if (dir === "right") return moveSel(1, 0);
      if (dir === "down") return grid ? moveSel(0, 1) : undefined;
      // up: move a row in the grid, else hop up into the chrome.
      if (grid && sel >= stride) return moveSel(0, -1);
      plane.current = "chrome";
      // Prefer a button (text inputs trap keyboard arrows in the typing guard).
      (
        document.querySelector(
          ".aurora-gridtop button, .blade-nav__tab, .aurora-gridtop input",
        ) as HTMLElement | null
      )?.focus();
      return;
    }
    // Chrome plane around a reel: re-enter the reel when stepping toward it.
    if (cardView(d)) {
      const reel = reelEl();
      const cur = document.activeElement;
      if (reel && cur instanceof HTMLElement) {
        const rr = reel.getBoundingClientRect();
        const cc = cur.getBoundingClientRect();
        const above = cc.bottom <= rr.top + 1;
        const below = cc.top >= rr.bottom - 1;
        if ((dir === "down" && above) || (dir === "up" && below)) {
          plane.current = "reel";
          cur.blur();
          return;
        }
      }
    }
    moveFocus(dir, navRoot());
  }

  // Confirm (A / Enter): launch the focused game in the reel, else click focus.
  function confirm() {
    usingController();
    const d = ref.current;
    // Don't launch from the reel while an overlay is up (e.g. the on-screen
    // keyboard over the library, where cardView is still true) — A there should
    // activate the focused overlay control / type the highlighted key.
    if (!inputTrapped() && cardView(d) && plane.current === "reel") {
      if (d.state.selectedGameId) d.dispatch({ type: "REQUEST_LAUNCH" });
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    // A text field can't be "clicked" usefully by a controller — open the
    // on-screen keyboard to edit it instead.
    const field = asTextField(active);
    if (field) {
      openOsk(field);
      return;
    }
    activateFocused();
    // Picking a Settings category should drop focus into that category's panel
    // so its controls (Sources & Scan, etc.) are reachable straight away — the
    // tall rail otherwise traps vertical steering and the content needs a
    // non-obvious right-press to enter. The panel remounts on the category
    // change (key={cat}); defer to a macrotask so focus lands after React has
    // committed the new panel (a sync focus would hit the old, unmounting one).
    if (active?.classList.contains("aurora-settings__rail-row")) {
      setTimeout(() => {
        const panel = document.querySelector(".aurora-settings__panel");
        if (panel) focusFirst(panel);
      }, 0);
    }
  }

  function openDetails() {
    if (inputTrapped()) return; // no-op behind a menu/keyboard, or when already open
    const d = ref.current;
    if (
      (d.pathname === "/" || d.pathname === "/home") &&
      d.state.selectedGameId
    )
      d.dispatch({ type: "OPEN_DETAILS" });
  }

  function back() {
    // The on-screen keyboard is innermost — Back closes it first. (Query the DOM,
    // not oskOpen: this runs from the mount-once gamepad/key listeners, whose
    // closure would otherwise see a stale value.)
    if (document.querySelector(".osk")) {
      closeOsk();
      return;
    }
    // An open dropdown captures Back: close just the menu, not the modal/page
    // behind it. Toggle it via its own trigger (which also restores focus there).
    // A synthetic Escape would bubble back into this same global handler and, with
    // the menu still in the DOM for that tick, recurse until the stack overflows.
    const openSelect = document.querySelector(".custom-select.is-open");
    if (openSelect) {
      const trigger = openSelect.querySelector<HTMLElement>(".custom-select__trigger");
      trigger?.click();
      trigger?.focus();
      return;
    }
    // Nested "unsaved profile changes" dialog (lives inside the details panel):
    // Back cancels just it, not the whole details modal behind it.
    const cancelUnsaved = document.querySelector<HTMLElement>(".unsaved-dialog__cancel");
    if (cancelUnsaved) {
      cancelUnsaved.click();
      return;
    }
    // Controller-only folder picker. Its own Escape handler isn't reached by the
    // gamepad B button (which calls back() directly, not via a keydown), so cancel
    // it here by clicking its Cancel button (the first action button).
    const cancelFolder = document.querySelector<HTMLElement>(".folder-browser__actions button");
    if (cancelFolder) {
      cancelFolder.click();
      return;
    }
    const d = ref.current;
    if (d.state.detailsOpen) d.dispatch({ type: "CLOSE_DETAILS" });
    else if (d.pathname !== "/home") d.navigate("/home");
  }

  // Quit (Start/Menu button, Ctrl+Q, or the legend chip). Matches the title-bar
  // close button — instant, no confirm. Guarded so a press behind a modal / OSK /
  // lightbox no-ops instead of surprise-quitting; Back dismisses those first.
  function quit() {
    if (inputTrapped()) return;
    void windowClose();
  }

  function requestLaunch() {
    const d = ref.current;
    if (
      (d.pathname === "/" || d.pathname === "/home") &&
      d.state.selectedGameId
    )
      d.dispatch({ type: "REQUEST_LAUNCH" });
  }

  // When a controller user lands on a focus-driven screen (page, Sources, or the
  // Details modal), seed focus so the d-pad has somewhere to start. Reset the
  // reel plane on every route/modal change.
  useEffect(() => {
    plane.current = "reel";
    if (!document.body.classList.contains("using-controller")) return;
    if (state.detailsOpen) {
      const panel = document.querySelector(".aurora-modal__panel");
      // The modal focuses its own panel container on open; treat that (and no
      // focus) as "not yet inside" so we still seed a real control. Only skip
      // when focus already sits on an actual focusable child.
      const active = document.activeElement;
      const alreadyInside = !!panel && active !== panel && panel.contains(active);
      if (panel && !alreadyInside) {
        // Land on the left rail's active blade (Info by default, or the one this
        // game was last left on) — not the modal's close button, which is the
        // first focusable but the wrong place to steer from.
        const blade =
          panel.querySelector<HTMLElement>(".aurora-details__blade.is-active") ??
          panel.querySelector<HTMLElement>(".aurora-details__blade");
        if (blade) blade.focus();
        else focusFirst(panel);
      }
      return;
    }
    if (pathname === "/" && selectVisibleLibraryCards(state).length > 0) return;
    const root =
      document.querySelector(".app-shell__content") ??
      document.querySelector(".app-shell");
    if (root && !root.contains(document.activeElement)) focusFirst(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, state.detailsOpen]);

  // Track the last focused control so spatial nav can resume there when an async
  // action disables/unmounts it (the browser would otherwise punt focus to
  // <body> and the next d-pad press would restart at the top of the page).
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) =>
      rememberFocus(e.target as HTMLElement | null);
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);

  // Mouse use flips the legend back to keyboard shortcuts (a mouse user has no
  // controller glyphs to read), matching how mousemove already drops the focus
  // rings in useGamepad. markInput no-ops when already "key", so the constant
  // mousemove stream costs nothing.
  useEffect(() => {
    const toKey = () => markInput("key");
    window.addEventListener("mousemove", toKey, { passive: true });
    window.addEventListener("mousedown", toKey, { passive: true });
    window.addEventListener("wheel", toKey, { passive: true });
    return () => {
      window.removeEventListener("mousemove", toKey);
      window.removeEventListener("mousedown", toKey);
      window.removeEventListener("wheel", toKey);
    };
    // Mount-once; markInput is stable via inputModeRef/setInputMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a menu (e.g. CustomSelect) handled it
      markInput("key"); // keyboard drives the legend to shortcut glyphs
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (typing) {
        if (e.key === "Escape") t.blur();
        return;
      }
      // Lightbox open: trap all keys here so arrows browse screenshots and
      // Escape closes the viewer (not the details modal behind it).
      if (lightboxEl()) {
        if (e.key === "ArrowLeft") clickSel(".aurora-lightbox__nav--prev");
        else if (e.key === "ArrowRight") clickSel(".aurora-lightbox__nav--next");
        else if (e.key === "Escape") clickSel(".aurora-lightbox__close");
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        quit();
        return;
      }
      switch (e.key) {
        case "[":
          cycleTab(-1);
          break;
        case "]":
          cycleTab(1);
          break;
        case "ArrowLeft":
          steer("left");
          break;
        case "ArrowRight":
          steer("right");
          break;
        case "ArrowUp":
          steer("up");
          break;
        case "ArrowDown":
          steer("down");
          break;
        case "i":
        case "I":
          if (ref.current.state.detailsOpen) back();
          else openDetails();
          break;
        case "s":
        case "S":
          cycleSort();
          break;
        case "-":
        case "_":
          zoomLib(-1);
          break;
        case "=":
        case "+":
          zoomLib(1);
          break;
        case "PageDown":
          scrollMenu(1);
          break;
        case "PageUp":
          scrollMenu(-1);
          break;
        case "Enter":
          // confirm() clicks the focused control itself; suppress the browser's
          // native Enter activation or every focused button fires twice.
          e.preventDefault();
          confirm();
          break;
        case "/":
          if (ref.current.pathname === "/") openSearch(); // Library search hotkey
          break;
        case "b":
        case "B":
          if (ref.current.state.detailsOpen) back();
          break;
        case "Escape":
          back();
          break;
        default:
          return;
      }
      if (e.key.startsWith("Arrow") || e.key.startsWith("Page")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Mount-once listener; reads latest state via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gamepad ───────────────────────────────────────────────────────────
  // The driver polls only while a pad is connected and routes button/stick
  // input to the same actions as the keyboard above. Handlers read the latest
  // state via `ref`, so passing fresh closures each render is safe.
  useGamepad({
    onButton: (i) => {
      markInput("pad"); // controller drives the legend to button glyphs
      // Lightbox open: trap the pad on the viewer. D-pad L/R flip screenshots,
      // A/B close it; everything else is swallowed so nothing behind reacts.
      if (lightboxEl()) {
        usingController();
        if (i === 14) clickSel(".aurora-lightbox__nav--prev");
        else if (i === 15) clickSel(".aurora-lightbox__nav--next");
        else if (i === 0 || i === 1) clickSel(".aurora-lightbox__close");
        return;
      }
      // On-screen keyboard open: map the controller buttons to edit actions so the
      // user isn't forced to d-pad to every key. A (type the highlighted key), B
      // (close), and the d-pad (move between keys) fall through to the switch below.
      const oskField = document.querySelector(".osk") ? oskTarget.current : null;
      if (oskField) {
        usingController();
        switch (i) {
          case 2: oskBackspace(oskField); return;     // X — Backspace
          case 3: oskInsert(oskField, " "); return;   // Y — Space
          case 4: oskMoveCaret(oskField, -1); return; // LB — caret left
          case 5: oskMoveCaret(oskField, 1); return;  // RB — caret right
          case 6: clickSel(".osk__key--symbols"); return; // LT — Symbols set
          case 7: clickSel(".osk__key--accents"); return; // RT — Accents set
          case 10: clickSel(".osk__key--caps"); return;   // L3 — Caps toggle
          case 8:                                          // Select/Back — Done
          case 9:                                          // Start (standard map) — Done
          case 11: oskCommit(oskField); closeOsk(); return; // Menu/Start (this app's map) — apply + close
        }
      }
      switch (i) {
        case 14: steer("left"); break;
        case 15: steer("right"); break;
        case 12: steer("up"); break;
        case 13: steer("down"); break;
        case 0: confirm(); break;
        case 1: back(); break;
        case 2:
          if (inputTrapped()) break;
          if (ref.current.pathname === "/") openSearch(); // X on Library = Search
          else ref.current.navigate("/");
          break;
        case 3: openDetails(); break;
        case 4: cycleTab(-1); break;
        case 5: cycleTab(1); break;
        case 6: zoomLib(-1); break; // LT — zoom out
        case 7: zoomLib(1); break; // RT — zoom in
        case 10: cycleSort(); break; // L3 — cycle sort
        case 9: if (!inputTrapped()) ref.current.navigate("/settings"); break;
        case 11: quit(); break; // Menu/Start — quit the app
      }
    },
    onAxisDir: (dir) => {
      markInput("pad");
      steer(dir);
    },
    onScroll: (dy) => {
      markInput("pad");
      scrollActiveRegion(dy);
    },
    onRotate: (dx) => {
      markInput("pad");
      // Right-stick X spins the selected coverflow case; only while the reel owns
      // input (no-op in grid/rail — rotateActiveCase finds no spinnable case).
      const d = ref.current;
      if (cardView(d) && plane.current === "reel") rotateActiveCase(dx);
    },
    onRotateEnd: () => {
      const d = ref.current;
      if (cardView(d) && plane.current === "reel") spinHomeActiveCase();
    },
  });

  const A: LegendItem = { glyph: "A", color: LEGEND_COLORS.A, label: "Launch", kbd: "Enter", onAction: requestLaunch };
  const B: LegendItem = { glyph: "B", color: LEGEND_COLORS.B, label: "Back", kbd: "Esc", onAction: back };
  const X: LegendItem = { glyph: "X", color: LEGEND_COLORS.X, label: "Browse", kbd: "Space", onAction: () => navigate("/") };
  // On Library, X searches (opens the on-screen keyboard on the hidden field). The
  // chip doubles as the active-query readout; click/press it to edit or clear.
  const q = state.search.trim();
  const searchLabel = q ? `“${q.length > 10 ? q.slice(0, 9) + "…" : q}”` : "Search";
  const libraryHasGames = (state.browse?.cards.length ?? 0) > 0;
  const X_SEARCH: LegendItem = { glyph: "X", color: LEGEND_COLORS.X, label: searchLabel, kbd: "/", onAction: openSearch, labelWidth: 88 };
  const Y: LegendItem = { glyph: "Y", color: LEGEND_COLORS.Y, label: "Details", kbd: "I", onAction: openDetails };
  const LB: LegendItem = { glyph: "LB", color: LEGEND_COLORS.neutral, label: "Prev Tab", kbd: "[", onAction: () => cycleTab(-1) };
  const RB: LegendItem = { glyph: "RB", color: LEGEND_COLORS.neutral, label: "Next Tab", kbd: "]", onAction: () => cycleTab(1) };
  const LT: LegendItem = { glyph: "LT", color: LEGEND_COLORS.neutral, label: "Zoom −", kbd: "-", onAction: () => zoomLib(-1) };
  const RT: LegendItem = { glyph: "RT", color: LEGEND_COLORS.neutral, label: "Zoom +", kbd: "=", onAction: () => zoomLib(1) };
  const RS: LegendItem = { glyph: "RS", color: LEGEND_COLORS.neutral, label: "Scroll", kbd: "PgDn", onAction: () => scrollMenu(1) };
  // labelWidth fits the widest "Sort: <mode>" so cycling never reflows the row.
  const SORT: LegendItem = { glyph: "L3", color: LEGEND_COLORS.neutral, label: `Sort: ${SORT_LABELS[state.sortMode]}`, kbd: "S", onAction: cycleSort, labelWidth: 82 };
  const QUIT: LegendItem = { glyph: "☰", color: LEGEND_COLORS.neutral, label: "Quit", kbd: "Ctrl Q", onAction: quit };
  const legend = onLibrary
    ? [A, B, libraryHasGames ? X_SEARCH : X, Y, SORT, LB, RB, LT, RT, QUIT]
    : onGame ? [A, B, X, Y, LB, RB, QUIT] : [B, X, LB, RB, RS, QUIT];

  return (
    <div className="app-shell">
      <AuroraField />
      <UpdateBanner />
      <BladeNav />
      <main className="app-shell__content">{children}</main>
      <LegendBar items={legend} mode={inputMode} />
      <WindowControls />
      {oskOpen && oskTarget.current && (
        <OnScreenKeyboard target={oskTarget.current} onClose={closeOsk} />
      )}
    </div>
  );
}
