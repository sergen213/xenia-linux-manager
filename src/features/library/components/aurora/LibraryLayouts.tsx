import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  CoverArt,
  GameCase,
  Reflection,
} from "../../../../components/aurora/GameCase";
import { cancelSpinHome, spinHomeActiveCase } from "../../../../components/app-shell/spatialNav";
import type { LibraryBrowseCard } from "../../model/libraryTypes";
import type { LibrarySortMode } from "../../state/libraryStore";
import { ZOOM_MAX, ZOOM_MIN } from "../../../../theme/auroraPrefs";
import { displayTitle } from "../../../shared/format";

// Only render cases within this many slots of the selection — keeps the
// coverflow cheap on large libraries (a 200-game shelf would otherwise mount
// 200 layered 3D cases).
const CAROUSEL_WINDOW = 8;
// Slot spacing as a multiple of case width. Blade fans cases out (the handoff's
// 158/128); the rail packs flat posters into a tight filmstrip.
const SLOT_RATIO = 1.23;
const RAIL_SLOT_RATIO = 1.12;

type ReelVariant = "blade" | "rail";

/** Case width that keeps the selected case inside the available carousel height,
 *  so it never clips on a short window. Blade reserves headroom for the 1.5×
 *  centre case; the rail only lifts ~1.12× so its posters can run larger.
 *  `zoom` scales the default size but stays bounded by the height-fit. */
function caseWidthFor(areaHeight: number, zoom: number, variant: ReelVariant = "blade"): number {
  const headroom = variant === "rail" ? 1.9 : 2.7;
  const fit = Math.floor((areaHeight - 32) / headroom); // largest that fits the height
  const base = Math.min(variant === "rail" ? 168 : 144, fit); // default at zoom = 1
  return Math.max(48, Math.min(fit, Math.round(base * zoom)));
}

/** Flat poster for the rail filmstrip: forward-facing, dimmed unless selected,
 *  which lifts + rings (no 3D tilt — that's the blade's job). */
function RailCover({ card, selected, w }: { card: LibraryBrowseCard; selected: boolean; w: number }) {
  return (
    <div
      style={{
        transformOrigin: "bottom center",
        transform: selected ? "translateY(-8px) scale(1.12)" : "scale(1)",
        transition:
          "transform 320ms cubic-bezier(0.22,1,0.36,1), filter 320ms ease, box-shadow 320ms ease",
        position: "relative",
        borderRadius: 6,
        boxShadow: selected
          ? "0 0 0 2px rgba(255,255,255,0.95), 0 18px 44px color-mix(in srgb, var(--au-accent) 55%, transparent)"
          : "0 8px 20px rgba(0,0,0,0.4)",
        filter: selected ? "none" : "brightness(0.6) saturate(0.9)",
      }}
    >
      <CoverArt card={card} w={w} />
    </div>
  );
}

interface LayoutProps {
  cards: LibraryBrowseCard[];
  sel: number;
  onPick: (index: number) => void;
  onActivate: (index: number) => void;
}

function FlatCover({ card, selected, w }: { card: LibraryBrowseCard; selected: boolean; w: number }) {
  return (
    <div
      style={{
        transformOrigin: "bottom center",
        transform: selected ? "scale(1.5)" : "scale(1)",
        transition: "transform 600ms cubic-bezier(0.22,1,0.36,1)",
        position: "relative",
        borderRadius: 5,
        boxShadow: selected
          ? "0 0 0 2px rgba(255,255,255,0.95), 0 8px 34px color-mix(in srgb, var(--au-accent) 65%, transparent)"
          : "none",
        filter: selected ? "none" : "brightness(0.86) saturate(0.92)",
      }}
    >
      <CoverArt card={card} w={w} />
    </div>
  );
}

interface CarouselProps extends LayoutProps {
  cover3D: boolean;
  reflections: boolean;
  zoom: number;
  /** "blade" = angled 3D coverflow; "rail" = flat poster filmstrip. */
  variant: ReelVariant;
}

/** Ease a numeric prop toward its latest value so derived sizing (zoom → cover
 *  width) transitions instead of snapping when the +/- buttons step the level.
 *  Interrupting mid-tween eases from the current value. Honors reduced motion. */
function useTweenedValue(target: number, ms: number): [number, boolean] {
  const [value, setValue] = useState(target);
  const [animating, setAnimating] = useState(false);
  const currentRef = useRef(target);
  useEffect(() => {
    const from = currentRef.current;
    if (from === target) return;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      currentRef.current = target;
      setValue(target);
      return;
    }
    setAnimating(true);
    let raf = 0;
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / ms);
      const cur = from + (target - from) * ease(t);
      currentRef.current = cur;
      setValue(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setAnimating(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return [value, animating];
}

/** Blade (3D coverflow) / Rail (flat filmstrip) reel. */
export function LibraryCarousel({
  cards,
  sel,
  cover3D,
  reflections,
  zoom,
  variant,
  onPick,
  onActivate,
}: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = useState(0);
  // Latest selection for the mount-once wheel listener (no re-subscribe per move).
  const selRef = useRef(sel);
  selRef.current = sel;
  // Cooldown timestamp must survive effect re-subscription (onPick changes
  // identity every time the selection moves), otherwise the cooldown resets to 0
  // after each step and rapid wheel events skip games again.
  const lastStepRef = useRef(0);

  // Drag-to-rotate the selected 3D case (blade + cover3D only). Both this and the
  // gamepad right stick (AppShell → rotateActiveCase) write the shared --au-spin
  // var on the track; the selected GameCase reads it. Reset when selection moves.
  const canSpin = variant === "blade" && cover3D;
  const spinDragRef = useRef<{ x: number; start: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    cancelSpinHome();
    trackRef.current?.style.setProperty("--au-spin", "0deg");
  }, [sel]);
  const onSpinDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSpin) return;
    const slot = (e.target as HTMLElement).closest(".aurora-carousel__slot");
    if (slot?.getAttribute("aria-current") !== "true") return; // only the selected case spins
    const track = trackRef.current;
    if (!track) return;
    cancelSpinHome(); // grabbing mid spin-home takes over
    spinDragRef.current = { x: e.clientX, start: parseFloat(track.style.getPropertyValue("--au-spin")) || 0 };
    setSpinning(true);
    track.setPointerCapture(e.pointerId);
  };
  const onSpinMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = spinDragRef.current;
    const track = trackRef.current;
    if (!d || !track) return;
    // Unbounded — drag far enough to turn the case a full 360.
    track.style.setProperty("--au-spin", `${d.start + (e.clientX - d.x) * 0.55}deg`);
  };
  const onSpinUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spinDragRef.current) return;
    spinDragRef.current = null;
    setSpinning(false);
    trackRef.current?.releasePointerCapture(e.pointerId);
    spinHomeActiveCase(); // let go → ease back to front
  };

  // Track the live carousel height so cases never clip on a short window.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAreaH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // caseW is derived (not stored) from the tweened zoom so it grows/shrinks
  // smoothly across every animation frame instead of snapping on each step.
  const [animZoom, zooming] = useTweenedValue(zoom, 300);
  const caseW = areaH ? caseWidthFor(areaH, animZoom, variant) : 128;

  // Mouse-wheel / trackpad scrolls the reel: one game per gesture. Step on the
  // leading edge, then ignore further wheel events (including trackpad momentum
  // and high-resolution wheels) until the cooldown passes — otherwise a single
  // fast flick or one big deltaY skips past several games.
  // ponytail: fixed cooldown; expose as a pref if anyone wants scroll speed control.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const COOLDOWN_MS = 220;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 2) return;
      if (e.timeStamp - lastStepRef.current < COOLDOWN_MS) return;
      lastStepRef.current = e.timeStamp;
      const dir = e.deltaY > 0 ? 1 : -1;
      const cur = selRef.current;
      const next = Math.max(0, Math.min(cards.length - 1, cur + dir));
      if (next !== cur) onPick(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cards.length, onPick]);

  const rail = variant === "rail";
  const slot = Math.round(caseW * (rail ? RAIL_SLOT_RATIO : SLOT_RATIO));
  const caseH = Math.round(caseW * 1.4);
  const tx = -(sel * slot + slot / 2);

  return (
    <div className="aurora-carousel" ref={ref}>
      <div
        className="aurora-carousel__track"
        ref={trackRef}
        onPointerDown={onSpinDown}
        onPointerMove={onSpinMove}
        onPointerUp={onSpinUp}
        onPointerCancel={onSpinUp}
        style={{
          height: caseH,
          transform: `translateX(${tx}px)`,
          // The 600ms slide (CSS class) is for selection moves; while zooming,
          // tx shifts every frame to keep the reel centered, so let it track
          // instantly instead of lagging behind the growth.
          transition: zooming ? "none" : undefined,
          cursor: spinning ? "grabbing" : undefined,
        }}
      >
        {cards.map((card, i) => {
          if (Math.abs(i - sel) > CAROUSEL_WINDOW) return null;
          const isSel = i === sel;
          const angle = isSel ? -12 : i < sel ? 52 : -52;
          let visual: ReactNode;
          let refl: ReactNode;
          if (rail) {
            visual = <RailCover card={card} selected={isSel} w={caseW} />;
            refl = (
              <div style={{ transformOrigin: "bottom center", transform: isSel ? "scale(1.12)" : "scale(1)" }}>
                <CoverArt card={card} w={caseW} />
              </div>
            );
          } else {
            visual = cover3D ? (
              <GameCase card={card} w={caseW} angle={angle} selected={isSel} spin={isSel} />
            ) : (
              <FlatCover card={card} selected={isSel} w={caseW} />
            );
            refl = cover3D ? (
              <GameCase card={card} w={caseW} angle={angle} selected={isSel} spin={isSel} />
            ) : (
              <div style={{ transformOrigin: "bottom center", transform: isSel ? "scale(1.5)" : "scale(1)" }}>
                <CoverArt card={card} w={caseW} />
              </div>
            );
          }
          return (
            <button
              key={card.game_id}
              type="button"
              className="aurora-carousel__slot"
              style={{
                left: i * slot,
                width: slot,
                zIndex: isSel ? 6 : 1,
                cursor: canSpin && isSel ? (spinning ? "grabbing" : "grab") : undefined,
                touchAction: canSpin && isSel ? "none" : undefined,
              }}
              aria-label={displayTitle(card.title)}
              aria-current={isSel ? "true" : undefined}
              onClick={() => onPick(i)}
              onDoubleClick={() => onActivate(i)}
            >
              {visual}
              {reflections && <Reflection>{refl}</Reflection>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Grid metrics: desired cover width drives the column count; covers then grow
// to fill each cell so they scale with the window instead of sitting tiny in a
// wide cell. Gap/padding match .aurora-grid in LibraryAurora.css.
const GRID_GAP_X = 22;
const GRID_PAD_R = 6;
const GRID_TARGET_W = 165;

/** One grid cell. Memoized so moving the selection only re-renders the two
 *  cells whose `selected` flips — not every CoverArt in the wall (a 200-game
 *  grid would otherwise re-decode 200 covers per arrow press). Relies on the
 *  parent passing stable onPick/onActivate refs; without that, memo is a no-op. */
const GridCell = memo(function GridCell({
  card,
  index,
  selected,
  width,
  onPick,
  onActivate,
}: {
  card: LibraryBrowseCard;
  index: number;
  selected: boolean;
  width: number;
  onPick: (index: number) => void;
  onActivate: (index: number) => void;
}) {
  return (
    <button
      type="button"
      className={`aurora-grid__cell ${selected ? "is-active" : ""}`}
      onClick={() => onPick(index)}
      onDoubleClick={() => onActivate(index)}
    >
      <div className="aurora-grid__cover">
        <CoverArt card={card} w={width} />
      </div>
      <span className="aurora-grid__label" style={{ maxWidth: width }}>
        {displayTitle(card.title)}
      </span>
    </button>
  );
});

/** Grid wall of flat covers — covers resize to fill the cell on window resize.
 *  `zoom` scales the target cover width, so zooming in yields fewer, bigger cells. */
export function LibraryGridWall({ cards, sel, zoom, onPick, onActivate }: LayoutProps & { zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: 6, w: 122 });

  // onPick/onActivate change identity on every selection move (see
  // LibraryCarousel); wrap them in refs so the cell's callback props stay stable
  // and GridCell's memo can actually skip the unaffected cells.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const pick = useCallback((i: number) => onPickRef.current(i), []);
  const activate = useCallback((i: number) => onActivateRef.current(i), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = GRID_TARGET_W * zoom;
    const measure = () => {
      const avail = el.clientWidth - GRID_PAD_R;
      const cols = Math.max(2, Math.round((avail + GRID_GAP_X) / (target + GRID_GAP_X)));
      const w = Math.floor((avail - GRID_GAP_X * (cols - 1)) / cols);
      setGrid({ cols, w });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  // Keep the selection on screen as arrows/controller walk it past the fold —
  // the grid scrolls itself (overflow:auto), so nothing moves without this.
  // block:"nearest" no-ops when the cell is already visible (mouse clicks).
  useEffect(() => {
    const cell = ref.current?.children[sel] as HTMLElement | undefined;
    cell?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div
      className="aurora-grid"
      ref={ref}
      style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
    >
      {cards.map((card, i) => (
        <GridCell
          key={card.game_id}
          card={card}
          index={i}
          selected={i === sel}
          width={grid.w}
          onPick={pick}
          onActivate={activate}
        />
      ))}
    </div>
  );
}

export const SORT_LABELS: Record<LibrarySortMode, string> = {
  recent: "Recent",
  title: "Title",
};
export const SORT_NEXT: Record<LibrarySortMode, LibrarySortMode> = {
  recent: "title",
  title: "recent",
};

/** Grid-mode top bar: title + count + zoom (replaces the blade nav). Sort lives
 *  in the bottom legend (S / L3), same as the blade view — no duplicate chip up
 *  here. Search is driven from the legend's Search action, not a bar. */
export function GridTopBar({
  total,
  zoom,
  onZoom,
}: {
  total: number;
  zoom: number;
  onZoom: (delta: number) => void;
}) {
  return (
    <div className="aurora-gridtop">
      <span className="aurora-gridtop__title">Library</span>
      <span className="aurora-gridtop__count">{total} GAMES</span>
      <div className="aurora-gridtop__spacer" />
      <LibraryZoomControl zoom={zoom} onZoom={onZoom} inline />
    </div>
  );
}

/** Vertical zoom control pinned to the right edge of the Library stage. The
 *  controller drives the same zoom via LT/RT (wired in AppShell). */
export function LibraryZoomControl({
  zoom,
  onZoom,
  inline = false,
}: {
  zoom: number;
  onZoom: (delta: number) => void;
  /** Render in normal flow (e.g. inside the grid top bar) instead of pinned. */
  inline?: boolean;
}) {
  return (
    <div
      className={`aurora-zoom${inline ? " aurora-zoom--inline" : ""}`}
      role="group"
      aria-label="Zoom covers"
    >
      <button
        type="button"
        className="aurora-zoom__btn"
        aria-label="Zoom out"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => onZoom(-1)}
      >
        <ZoomOut size={18} strokeWidth={2} aria-hidden />
      </button>
      <span className="aurora-zoom__level">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className="aurora-zoom__btn"
        aria-label="Zoom in"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => onZoom(1)}
      >
        <ZoomIn size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

export function LibraryInfoBar({ title, pos, total }: { title: string; pos: number; total: number }) {
  return (
    <div className="aurora-infobar">
      <div className="aurora-infobar__title">{title}</div>
      <div className="aurora-infobar__count">
        {pos} OF {total}
      </div>
    </div>
  );
}

