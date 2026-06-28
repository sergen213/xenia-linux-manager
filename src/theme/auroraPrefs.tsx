import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Aurora UI preferences — view layout, theme, background tint, and effect
 * toggles. These are pure renderer-side presentation prefs, so they live in
 * localStorage (not the Rust-backed AppSettings). The handoff persists the same
 * keys under "xenia-aurora-prefs".
 */
export type ViewMode = "blade" | "rail" | "grid";
export type Theme = "dark" | "light";
export type FieldTint = "aurora" | "violet" | "jade";

/** Pickable theme / tint options (id + label), shared by Settings and the
 *  first-run setup so the labels have a single source. */
// eslint-disable-next-line react-refresh/only-export-components
export const THEME_OPTIONS: Array<[Theme, string]> = [
  ["dark", "Dark"],
  ["light", "Light"],
];
// eslint-disable-next-line react-refresh/only-export-components
export const TINT_OPTIONS: Array<[FieldTint, string]> = [
  ["aurora", "Aurora Blue"],
  ["violet", "Twilight Violet"],
  ["jade", "Graphite Jade"],
];

export interface AuroraPrefs {
  viewMode: ViewMode;
  theme: Theme;
  fieldTint: FieldTint;
  cover3D: boolean;
  reflections: boolean;
  ambientMotion: boolean;
  /** Library cover zoom multiplier (1 = default). See ZOOM_* / clampZoom. */
  zoom: number;
}

// Library zoom range. Steps are coarse so each press/click is a visible jump.
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.8;
export const ZOOM_STEP = 0.2;
/** Clamp + snap to a step. toFixed(2) collapses float drift so the result
 *  equals ZOOM_MIN/ZOOM_MAX exactly at the ends (boundary disable checks rely
 *  on `zoom <= ZOOM_MIN` / `>= ZOOM_MAX`). */
// eslint-disable-next-line react-refresh/only-export-components
export function clampZoom(z: number): number {
  const snapped = Number((Math.round(z / ZOOM_STEP) * ZOOM_STEP).toFixed(2));
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped));
}

const DEFAULTS: AuroraPrefs = {
  viewMode: "blade",
  theme: "dark",
  fieldTint: "aurora",
  cover3D: true,
  reflections: true,
  ambientMotion: true,
  zoom: 1.4,
};

const STORAGE_KEY = "xenia-aurora-prefs";

function load(): AuroraPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AuroraPrefs>) };
      // Drop view modes that no longer exist (e.g. the removed "shelf").
      const modes: ViewMode[] = ["blade", "rail", "grid"];
      if (!(modes as string[]).includes(merged.viewMode)) merged.viewMode = DEFAULTS.viewMode;
      return merged;
    }
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  return DEFAULTS;
}

interface AuroraPrefsContextValue {
  prefs: AuroraPrefs;
  setPref: <K extends keyof AuroraPrefs>(key: K, value: AuroraPrefs[K]) => void;
}

const AuroraPrefsContext = createContext<AuroraPrefsContextValue | null>(null);

export function AuroraPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AuroraPrefs>(load);

  // Reflect theme + tint onto <html> so the CSS token layer can scope by
  // [data-theme] / [data-tint]. Dark/aurora is the unscoped default in app.css,
  // so first paint is correct even before this effect runs.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = prefs.theme;
    el.dataset.tint = prefs.fieldTint;
  }, [prefs.theme, prefs.fieldTint]);

  const setPref: AuroraPrefsContextValue["setPref"] = (key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <AuroraPrefsContext.Provider value={{ prefs, setPref }}>
      {children}
    </AuroraPrefsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuroraPrefs(): AuroraPrefsContextValue {
  const ctx = useContext(AuroraPrefsContext);
  // Fall back to defaults (no-op writes) when no provider is mounted — keeps
  // isolated component renders / tests working with the intended default look.
  if (!ctx) return { prefs: DEFAULTS, setPref: () => {} };
  return ctx;
}
