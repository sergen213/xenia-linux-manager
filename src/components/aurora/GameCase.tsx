import { useCallback, useState, type CSSProperties } from "react";
import { convertFileSrc } from "../../platform/bridge";
import { displayTitle } from "../../features/shared/format";

/**
 * The Aurora 3D game case and its flat cover art. Ported from the design
 * handoff's makeCase()/coverArt(). The front face shows the game's real artwork
 * when available; otherwise a deterministic gradient placeholder derived from
 * the title (so the same game always gets the same colors). When the cover is a
 * full Xbox 360 case wrap (XboxUnity art: back | spine | front in one landscape
 * image) the front face is sliced from the wrap's right edge and the 3D case
 * spine is textured from its centre strip; a front-only cover (x360db fallback)
 * renders as a single front face with a gradient spine.
 */
export interface CoverCard {
  title: string;
  artwork_path: string | null;
  /** Short descriptor shown under the placeholder title (e.g. source/kind). */
  kind?: string | null;
}

const CASE_DEPTH = 18;
const ASPECT = 1.4;

// Full Xbox 360 case wraps from XboxUnity are one landscape image laid out
// [ back | spine | front ] at ~900x600 (ratio 1.5). x360db fallback art is a
// portrait front-only cover. We tell them apart by aspect ratio and, for a
// wrap, slice the right portion (front) onto flat tiles / the case front and
// the centre strip (spine) onto the case spine.
const WRAP_ASPECT = 1.5; // XboxUnity "large" = 900x600
const WRAP_SPINE_CENTER = 0.5; // spine sits at the wrap's horizontal middle
// ponytail: aspect heuristic — anything wider than this is treated as a wrap.
// A rare non-standard landscape upload would mis-slice; revisit if XboxUnity
// ever tags cover layout (it doesn't today).
const WRAP_DETECT_RATIO = 1.2;

/** True when a loaded image is a full landscape case wrap (vs a front cover). */
function isWrapImg(img: HTMLImageElement): boolean {
  return img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight > WRAP_DETECT_RATIO;
}

function hashTitle(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic placeholder palette for a title with no artwork. */
// eslint-disable-next-line react-refresh/only-export-components
export function coverColors(title: string): {
  c1: string;
  c2: string;
  accent: string;
} {
  const hue = hashTitle(title) % 360;
  return {
    c1: `hsl(${hue} 52% 42%)`,
    c2: `hsl(${(hue + 28) % 360} 58% 16%)`,
    accent: `hsl(${(hue + 175) % 360} 82% 66%)`,
  };
}

function Gloss() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(120% 80% at 16% 0%, rgba(255,255,255,0.30), rgba(255,255,255,0) 56%)",
      }}
    />
  );
}

interface CoverArtProps {
  card: CoverCard;
  w: number;
  gloss?: boolean;
  /** Notified once the cover loads: true if it's a full case wrap, not a front. */
  onWrap?: (isWrap: boolean) => void;
}

/** Flat front cover (grid tiles, reflections, recents, hero thumbnails). */
export function CoverArt({ card, w, gloss = true, onWrap }: CoverArtProps) {
  const h = Math.round(w * ASPECT);
  const src = card.artwork_path ? convertFileSrc(card.artwork_path) : null;
  const [failed, setFailed] = useState(false);
  const [wrap, setWrap] = useState(false);

  // Detect a full case wrap once the image's dimensions are known. Runs from the
  // img's ref (catches covers already complete from the grid cache, where onLoad
  // never fires) and from onLoad (the not-yet-cached path). Re-runs are no-ops:
  // setState with the same value bails out, so there's no render loop.
  const detectWrap = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const isWrap = isWrapImg(img);
      setWrap(isWrap);
      onWrap?.(isWrap);
    },
    [onWrap],
  );

  if (src && !failed) {
    // A wrap is anchored to its right edge at full height so only the front
    // face shows (the front's aspect ≈ the tile's, so it fills cleanly and the
    // back/spine clip off-frame). A front-only cover keeps plain object-fit.
    const imgStyle: CSSProperties = wrap
      ? { position: "absolute", top: 0, right: 0, height: "100%", width: "auto", display: "block" }
      : { width: "100%", height: "100%", objectFit: "cover", display: "block" };
    return (
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          borderRadius: 4,
          overflow: "hidden",
          flex: "0 0 auto",
          backgroundColor: "#0a0f18",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
        }}
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          ref={detectWrap}
          onLoad={(e) => detectWrap(e.currentTarget)}
          onError={() => setFailed(true)}
          style={imgStyle}
        />
        {gloss && <Gloss />}
      </div>
    );
  }

  const { c1, c2, accent } = coverColors(card.title);
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: 4,
        overflow: "hidden",
        flex: "0 0 auto",
        background: `linear-gradient(150deg, ${c1}, ${c2})`,
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.28)",
      }}
    >
      {gloss && <Gloss />}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: Math.round(h * 0.12),
          background: "linear-gradient(180deg, rgba(0,0,0,0.48), rgba(0,0,0,0.12))",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 7px",
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.88)" }} />
        <div style={{ height: 4, flex: 1, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: "33%", padding: "0 8px", textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#fff",
            fontSize: Math.max(13, Math.round(w * 0.165)),
            lineHeight: 0.98,
            letterSpacing: "0.01em",
            textShadow: "0 2px 7px rgba(0,0,0,0.6)",
          }}
        >
          {displayTitle(card.title)}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "62%",
          transform: "translateX(-50%)",
          width: Math.round(w * 0.3),
          height: 3,
          borderRadius: 2,
          background: accent,
          boxShadow: `0 0 10px ${accent}`,
        }}
      />
      {card.kind && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(h * 0.15),
            background: "linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: Math.round(h * 0.04),
          }}
        >
          <div
            style={{
              fontSize: Math.max(8, Math.round(w * 0.072)),
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.85)",
              fontWeight: 600,
            }}
          >
            {card.kind}
          </div>
        </div>
      )}
    </div>
  );
}

interface GameCaseProps {
  card: CoverCard;
  w: number;
  /** rotateY in degrees (coverflow tilt, or a drag-driven inspection spin). */
  angle: number;
  selected: boolean;
  /** Drop the rotate transition so the case tracks a drag pointer 1:1. */
  instant?: boolean;
  /** Add the shared `--au-spin` var to rotateY (carousel inspection spin), and
   *  drop the transition so mouse/stick input tracks 1:1. */
  spin?: boolean;
}

/** The 3D case: front cover + back + spine + edges, with coverflow transform. */
export function GameCase({ card, w, angle, selected, instant, spin }: GameCaseProps) {
  const W = w;
  const H = Math.round(w * ASPECT);
  const D = CASE_DEPTH;
  const { c1, c2 } = coverColors(card.title);
  const src = card.artwork_path ? convertFileSrc(card.artwork_path) : null;
  // Set once the front cover loads (via CoverArt) — true means a full wrap, so
  // the spine face can be textured from the wrap's centre strip.
  const [isWrap, setIsWrap] = useState(false);
  const ring = selected
    ? "0 0 0 2px rgba(255,255,255,0.95), 0 12px 42px color-mix(in srgb, var(--au-accent) 60%, transparent)"
    : "0 10px 24px rgba(0,0,0,0.45)";

  // Outer carries the coverflow tilt + selection scale; it keeps the 600ms ease
  // so switching games animates. The inspection spin lives on the inner layer so
  // it can track mouse/stick input (and the rAF spin-home) 1:1 with no transition
  // — without that split, spin=true would freeze the selection animation.
  const wrapper: CSSProperties = {
    position: "relative",
    width: W,
    height: H,
    transformStyle: "preserve-3d",
    transformOrigin: "bottom center",
    transform: `perspective(1600px) translateZ(${selected ? 0 : -34}px) rotateY(${angle}deg) scale(${selected ? 1.5 : 1})`,
    transition: instant ? "none" : "transform 600ms cubic-bezier(0.22,1,0.36,1)",
  };
  const spinLayer: CSSProperties = {
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    transform: spin ? "rotateY(var(--au-spin, 0deg))" : undefined,
  };

  return (
    <div style={wrapper}>
     <div style={spinLayer}>
      {/* Front face */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `translateZ(${D / 2}px)`,
          borderRadius: 4,
          overflow: "hidden",
          backfaceVisibility: "hidden",
          boxShadow: ring,
          filter: selected ? "none" : "brightness(0.9)",
        }}
      >
        <CoverArt card={card} w={W} onWrap={setIsWrap} />
      </div>
      {/* Back face: the wrap's left third (real printed back) when the cover is
          a full case wrap; otherwise a plain placeholder, since front-only
          covers (x360db fallback) carry no back art. Pre-rotated 180° so it
          reads correctly once the case is spun round to face the viewer. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `translateZ(${-D / 2}px) rotateY(180deg)`,
          borderRadius: 4,
          overflow: "hidden",
          backfaceVisibility: "hidden",
          boxShadow: ring,
          filter: selected ? "none" : "brightness(0.9)",
          background: `linear-gradient(150deg, ${c2}, ${c1})`,
        }}
      >
        {src && isWrap ? (
          <img
            src={src}
            alt=""
            decoding="async"
            style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "auto", display: "block" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontSize: Math.max(8, Math.round(W * 0.07)),
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            No back cover art
          </div>
        )}
        <Gloss />
      </div>
      {/* Spine (left): textured from the wrap's centre strip when available,
          otherwise a gradient placeholder carrying the vertical title. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: D,
          height: H,
          marginLeft: -D / 2,
          transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
          background: `linear-gradient(180deg, ${c1}, ${c2})`,
          boxShadow: "inset 3px 0 7px rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {src && isWrap ? (
          <img
            src={src}
            alt=""
            decoding="async"
            style={{
              position: "absolute",
              top: 0,
              height: "100%",
              width: "auto",
              // Centre the wrap's spine strip over the D-wide face.
              left: D / 2 - WRAP_SPINE_CENTER * H * WRAP_ASPECT,
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: Math.max(6, Math.round(W * 0.07)),
              color: "rgba(255,255,255,0.82)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              maxHeight: H - 10,
            }}
          >
            {displayTitle(card.title)}
          </div>
        )}
      </div>
      {/* Right edge (pages) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: D,
          height: H,
          marginLeft: -D / 2,
          transform: `rotateY(90deg) translateZ(${W / 2}px)`,
          background: "linear-gradient(90deg, #cfd3d9, #969ca4)",
          boxShadow: "inset -2px 0 6px rgba(0,0,0,0.35)",
        }}
      />
      {/* Top edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: W,
          height: D,
          marginTop: -D / 2,
          transform: `rotateX(90deg) translateZ(${H / 2}px)`,
          background: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(0,0,0,0.2))",
        }}
      />
      {/* Bottom edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: W,
          height: D,
          marginTop: -D / 2,
          transform: `rotateX(-90deg) translateZ(${H / 2}px)`,
          background: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.6))",
        }}
      />
     </div>
    </div>
  );
}

interface ReflectionProps {
  children: React.ReactNode;
}

/** Mirrored, faded copy rendered below a case/cover (toggled by the caller). */
export function Reflection({ children }: ReflectionProps) {
  return (
    <div
      style={{
        transform: "scaleY(-1)",
        opacity: 0.3,
        marginTop: 2,
        pointerEvents: "none",
        WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0) 56%)",
        maskImage: "linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0) 56%)",
      }}
    >
      {children}
    </div>
  );
}
