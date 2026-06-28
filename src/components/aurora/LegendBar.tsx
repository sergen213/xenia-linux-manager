import "./LegendBar.css";

/** Glyph colors for the controller legend (both themes). */
// eslint-disable-next-line react-refresh/only-export-components
export const LEGEND_COLORS = {
  A: "#6fc77f",
  B: "#e5675f",
  X: "#5aa8e6",
  Y: "#e6c34a",
  neutral: "var(--au-legend-neutral)",
} as const;

export interface LegendItem {
  glyph: string;
  color: string;
  label: string;
  kbd: string;
  onAction: () => void;
}

/**
 * Bottom controller/keyboard legend. Each chip is a real button that fires its
 * action. The shell decides which items are present (game vs non-game screens).
 */
export function LegendBar({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend-bar" role="toolbar" aria-label="Controller actions">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="legend-bar__item"
          title={item.label}
          onClick={item.onAction}
        >
          <span
            className="legend-bar__glyph"
            style={{ borderColor: item.color, color: item.color }}
          >
            {item.glyph}
          </span>
          <span className="legend-bar__label">{item.label}</span>
          <span className="legend-bar__kbd">{item.kbd}</span>
        </button>
      ))}
    </div>
  );
}
