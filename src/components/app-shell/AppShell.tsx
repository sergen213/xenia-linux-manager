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
import { activateFocused, focusFirst, moveFocus, rememberFocus, scrollActiveRegion, type Dir } from "./spatialNav";
import { useGamepad } from "./useGamepad";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
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
const GRID_COLUMNS = 6;

interface ShellRefData {
  pathname: string;
  navigate: NavigateFunction;
  state: LibraryState;
  dispatch: (action: LibraryAction) => void;
  gridStride: number;
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
  const openOsk = (el: TextField) => {
    oskTarget.current = el;
    setOskOpen(true);
  };
  const closeOsk = () => {
    const t = oskTarget.current;
    setOskOpen(false);
    t?.focus(); // return focus to the field so spatial nav resumes there
  };

  // Latest values for the always-mounted key/gamepad listeners (so they don't
  // re-subscribe on every selection change).
  const ref = useRef<ShellRefData>({
    pathname,
    navigate,
    state,
    dispatch,
    gridStride: GRID_COLUMNS,
    applyZoom: () => {},
  });
  // Keep the latest values available to the mount-once key/gamepad listeners.
  useEffect(() => {
    ref.current = {
      pathname,
      navigate,
      state,
      dispatch,
      gridStride: prefs.viewMode === "grid" ? GRID_COLUMNS : 1,
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
  // An open dropdown is innermost, so it wins.
  const navRoot = (): ParentNode =>
    document.querySelector(".osk") ??
    document.querySelector(".custom-select.is-open .custom-select__menu") ??
    document.querySelector(".aurora-modal__panel, .xenia-dialog") ??
    document.querySelector(".app-shell") ??
    document;
  const reelEl = () =>
    document.querySelector(".aurora-grid, .aurora-carousel");
  // Show focus rings only while steering by controller/keyboard, not for mouse.
  const usingController = () => document.body.classList.add("using-controller");

  // ── Imperative actions (read latest via ref) ──────────────────────────
  function cycleTab(dir: number) {
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
    if (cardView(d)) d.applyZoom(delta);
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
    i = Math.max(0, Math.min(cards.length - 1, i + dx + dy * d.gridStride));
    d.dispatch({ type: "SELECT_GAME", gameId: cards[i].game_id });
  }

  // Directional input — routes to reel index nav or DOM spatial nav.
  function steer(dir: Dir) {
    usingController();
    const d = ref.current;
    if (cardView(d) && plane.current === "reel") {
      const grid = d.gridStride > 1;
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
      if (grid && sel >= d.gridStride) return moveSel(0, -1);
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
    if (cardView(d) && plane.current === "reel") {
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
    // An open dropdown captures Back: close just the menu (reuse its own Escape
    // handling), not the modal/page behind it.
    const openSelect = document.querySelector(".custom-select.is-open");
    if (openSelect) {
      (document.activeElement ?? openSelect).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return;
    }
    const d = ref.current;
    if (d.state.detailsOpen) d.dispatch({ type: "CLOSE_DETAILS" });
    else if (d.pathname !== "/home") d.navigate("/home");
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
    const generic =
      state.detailsOpen ||
      !(pathname === "/" && selectVisibleLibraryCards(state).length > 0);
    if (!generic) return;
    const root = state.detailsOpen
      ? document.querySelector(".aurora-modal__panel")
      : (document.querySelector(".app-shell__content") ??
        document.querySelector(".app-shell"));
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

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a menu (e.g. CustomSelect) handled it
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
          confirm();
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
      switch (i) {
        case 14: steer("left"); break;
        case 15: steer("right"); break;
        case 12: steer("up"); break;
        case 13: steer("down"); break;
        case 0: confirm(); break;
        case 1: back(); break;
        case 2: ref.current.navigate("/"); break;
        case 3: openDetails(); break;
        case 4: cycleTab(-1); break;
        case 5: cycleTab(1); break;
        case 6: zoomLib(-1); break; // LT — zoom out
        case 7: zoomLib(1); break; // RT — zoom in
        case 9: ref.current.navigate("/settings"); break;
      }
    },
    onAxisDir: steer,
    onScroll: scrollActiveRegion,
  });

  const A: LegendItem = { glyph: "A", color: LEGEND_COLORS.A, label: "Launch", kbd: "Enter", onAction: requestLaunch };
  const B: LegendItem = { glyph: "B", color: LEGEND_COLORS.B, label: "Back", kbd: "Esc", onAction: back };
  const X: LegendItem = { glyph: "X", color: LEGEND_COLORS.X, label: "Browse", kbd: "Space", onAction: () => navigate("/") };
  const Y: LegendItem = { glyph: "Y", color: LEGEND_COLORS.Y, label: "Details", kbd: "I", onAction: openDetails };
  const LB: LegendItem = { glyph: "LB", color: LEGEND_COLORS.neutral, label: "Prev Tab", kbd: "[", onAction: () => cycleTab(-1) };
  const RB: LegendItem = { glyph: "RB", color: LEGEND_COLORS.neutral, label: "Next Tab", kbd: "]", onAction: () => cycleTab(1) };
  const LT: LegendItem = { glyph: "LT", color: LEGEND_COLORS.neutral, label: "Zoom −", kbd: "-", onAction: () => zoomLib(-1) };
  const RT: LegendItem = { glyph: "RT", color: LEGEND_COLORS.neutral, label: "Zoom +", kbd: "=", onAction: () => zoomLib(1) };
  const RS: LegendItem = { glyph: "RS", color: LEGEND_COLORS.neutral, label: "Scroll", kbd: "PgDn", onAction: () => scrollMenu(1) };
  const legend = onLibrary ? [A, B, X, Y, LB, RB, LT, RT] : onGame ? [A, B, X, Y, LB, RB] : [B, X, LB, RB, RS];

  return (
    <div className="app-shell">
      <AuroraField />
      <BladeNav />
      <main className="app-shell__content">{children}</main>
      <LegendBar items={legend} />
      <WindowControls />
      {oskOpen && oskTarget.current && (
        <OnScreenKeyboard target={oskTarget.current} onClose={closeOsk} />
      )}
    </div>
  );
}
