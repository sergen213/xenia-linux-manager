import { useState, type CSSProperties } from "react";
import { convertFileSrc } from "../../platform/bridge";

/**
 * The Aurora 3D game case and its flat cover art. Ported from the design
 * handoff's makeCase()/coverArt(). The front face shows the game's real artwork
 * when available; otherwise a deterministic gradient placeholder derived from
 * the title (so the same game always gets the same colors). The handoff's
 * 3-region box-art "wrap" is omitted — the real library stores a single front
 * cover, not a full Xbox 360 wrap.
 */
export interface CoverCard {
  title: string;
  artwork_path: string | null;
  /** Short descriptor shown under the placeholder title (e.g. source/kind). */
  kind?: string | null;
}

const CASE_DEPTH = 13;
const ASPECT = 1.4;

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
}

/** Flat front cover (grid tiles, reflections, recents, hero thumbnails). */
export function CoverArt({ card, w, gloss = true }: CoverArtProps) {
  const h = Math.round(w * ASPECT);
  const src = card.artwork_path ? convertFileSrc(card.artwork_path) : null;
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
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
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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
          {card.title}
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
  /** rotateY in degrees (coverflow tilt). */
  angle: number;
  selected: boolean;
}

/** The 3D case: front cover + spine + edges, with coverflow transform. */
export function GameCase({ card, w, angle, selected }: GameCaseProps) {
  const W = w;
  const H = Math.round(w * ASPECT);
  const D = CASE_DEPTH;
  const { c1, c2 } = coverColors(card.title);
  const ring = selected
    ? "0 0 0 2px rgba(255,255,255,0.95), 0 12px 42px rgba(95,185,255,0.6)"
    : "0 10px 24px rgba(0,0,0,0.45)";

  const wrapper: CSSProperties = {
    position: "relative",
    width: W,
    height: H,
    transformStyle: "preserve-3d",
    transformOrigin: "bottom center",
    transform: `perspective(1600px) translateZ(${selected ? 0 : -34}px) rotateY(${angle}deg) scale(${selected ? 1.5 : 1})`,
    transition: "transform 600ms cubic-bezier(0.22,1,0.36,1)",
  };

  return (
    <div style={wrapper}>
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
          boxShadow: ring,
          filter: selected ? "none" : "brightness(0.9)",
        }}
      >
        <CoverArt card={card} w={W} />
      </div>
      {/* Spine (left) */}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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
          {card.title}
        </div>
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
