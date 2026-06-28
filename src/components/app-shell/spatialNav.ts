// DOM-focus spatial navigation for controller/keyboard. The card reels run their
// own index-based nav (their 3D transforms make getBoundingClientRect unreliable),
// so we steer everything else — pages, dialogs, the Details modal — by geometry.

export type Dir = "up" | "down" | "left" | "right";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Reel cells own their own index nav, and the legend bar is a button-hint row
// you read (not steer onto) — its chips would otherwise trap downward focus at
// the bottom of every screen. Keep both out of spatial focus.
const NO_NAV = ".aurora-grid, .aurora-carousel, .legend-bar";

// Containers whose up/down nav follows DOM reading order instead of geometry, so
// fields beside a tall side rail aren't skipped (the cross-axis penalty would
// otherwise dive into the rail). Both are rail + content two-column layouts.
// See moveFocus.
const LINEAR_NAV = ".aurora-settings__panel, .aurora-details__main";

function visible(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest(NO_NAV) && visible(el),
  );
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Last element we steered to. When an async action disables (or unmounts) the
// focused control, the browser punts focus to <body>; without this the next
// move would snap back to the first item (top of the page). Recording it lets
// moveFocus resume where the user was. AppShell feeds this from a focusin
// listener so every focus change — clicks included — is tracked centrally.
let lastFocused: HTMLElement | null = null;
let lastRect: DOMRect | null = null;

export function rememberFocus(el: HTMLElement | null): void {
  if (el && el !== document.body && el.isConnected) {
    lastFocused = el;
    lastRect = el.getBoundingClientRect();
  }
}

/** Where to resume when focus was lost: the remembered element if it's still
 *  focusable, else the focusable nearest its last on-screen position. */
function resumeFrom(items: HTMLElement[]): HTMLElement | null {
  if (lastFocused && items.includes(lastFocused)) return lastFocused;
  if (!lastRect) return null;
  const c = center(lastRect);
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const el of items) {
    const ec = center(el.getBoundingClientRect());
    const d = Math.hypot(ec.x - c.x, ec.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}

/** Move DOM focus to the nearest focusable in `dir` within `root`. Returns the
 *  focused element, or null if nothing lies that way (caller may hop planes). */
export function moveFocus(dir: Dir, root: ParentNode): HTMLElement | null {
  const items = focusables(root);
  if (!items.length) return null;

  const active = document.activeElement as HTMLElement | null;
  const cur = active && items.includes(active) ? active : null;
  if (!cur) {
    // Focus was lost (a control disabled itself mid-action and the browser
    // dropped focus to <body>). Resume where the user was, not at the top.
    const resumed = resumeFrom(items) ?? items[0];
    resumed.focus();
    return resumed;
  }

  // Dense form panels (Settings) stack a left content column beside right-aligned
  // action buttons (Scan All, Rescan, Remove) that have no left anchor — geometric
  // up/down steps down the left column and skips them. Inside such a panel, walk
  // up/down in DOM reading order so every control is reached; left/right stay
  // geometric for column switching, and the panel edges fall through to geometric
  // so the user can still leave it.
  const linearPanel = cur.closest(LINEAR_NAV);
  if (linearPanel && (dir === "up" || dir === "down")) {
    const list = items.filter((el) => linearPanel.contains(el));
    const next = list[list.indexOf(cur) + (dir === "down" ? 1 : -1)];
    if (next) {
      next.focus();
      next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      return next;
    }
  }

  const c = center(cur.getBoundingClientRect());
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const ec = center(el.getBoundingClientRect());
    const primary = (horizontal ? ec.x - c.x : ec.y - c.y) * sign;
    if (primary <= 1) continue; // not in the requested direction
    const cross = Math.abs(horizontal ? ec.y - c.y : ec.x - c.x);
    const score = primary + cross * 2; // axis distance + cross-axis penalty
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) {
    best.focus();
    best.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  return best;
}

export function focusFirst(root: ParentNode): HTMLElement | null {
  const first = focusables(root)[0] ?? null;
  first?.focus();
  return first;
}

/** Stick beyond this fraction of full deflection counts as a direction. */
export const AXIS_DEADZONE = 0.5;

/** Dominant direction from the LEFT analog stick (axes 0/1), or null in the
 *  deadzone. ponytail: left stick only. The d-pad hat (6/7) and right stick
 *  (2/3) rest at ±1 or get mismapped on non-standard Linux pads — reading them
 *  would report a direction forever and lock the UI. The d-pad itself is read
 *  from buttons 12–15 in AppShell, which covers standard mappings. */
export function readAxisDir(axes: readonly number[]): Dir | null {
  const x = axes[0] ?? 0;
  const y = axes[1] ?? 0;
  if (Math.abs(x) < AXIS_DEADZONE && Math.abs(y) < AXIS_DEADZONE) return null;
  return Math.abs(x) >= Math.abs(y)
    ? x > 0
      ? "right"
      : "left"
    : y > 0
      ? "down"
      : "up";
}

/** Right-stick Y deflection beyond this scrolls; below it counts as rest (and
 *  is the gate that "arms" the axis, so a stuck/mismapped stick resting at ±1
 *  never auto-scrolls). Lower than AXIS_DEADZONE because scrolling is analog and
 *  continuous, not a discrete step. */
export const SCROLL_DEADZONE = 0.2;

/** Map a right-stick Y deflection (-1..1) to a per-frame scroll delta in px.
 *  0 inside the deadzone; an x² curve past it gives fine control near centre and
 *  full speed at the rim. Down (+y) → scroll down, matching wheel direction. */
export function scrollDelta(ry: number, maxPerFrame = 22): number {
  const a = Math.abs(ry);
  if (a < SCROLL_DEADZONE) return 0;
  const mag = (a - SCROLL_DEADZONE) / (1 - SCROLL_DEADZONE);
  return Math.sign(ry) * mag * mag * maxPerFrame;
}

function isScrollable(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 1;
}

/** The scroll region the right stick drives: the nearest scrollable ancestor of
 *  whatever holds focus (Settings/Saves/Details all focus inside their panel),
 *  falling back to the Details modal body or the page content. */
function activeScrollRegion(): HTMLElement | null {
  for (
    let cur = document.activeElement as HTMLElement | null;
    cur && cur !== document.body;
    cur = cur.parentElement
  ) {
    if (isScrollable(cur)) return cur;
  }
  return (
    document.querySelector<HTMLElement>(".aurora-modal__body") ??
    document.querySelector<HTMLElement>(".app-shell__content")
  );
}

/** Scroll the active region by `dy` px — called each frame from the gamepad loop
 *  while the right stick is held. */
export function scrollActiveRegion(dy: number): void {
  activeScrollRegion()?.scrollBy(0, dy);
}

/** Activate the focused element (gamepad A / Enter). Buttons, links, summaries
 *  and toggle inputs get clicked; text fields just keep focus for typing. */
export function activateFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return;
  const tag = el.tagName;
  const toggle =
    tag === "INPUT" &&
    ["checkbox", "radio", "button", "submit", "reset"].includes(
      (el as HTMLInputElement).type,
    );
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || toggle) el.click();
}
