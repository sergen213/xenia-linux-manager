import "./AuroraRadio.css";

/** Single-select pill used for theme / tint / view-mode choices. Lives here
 *  (not in SettingsPage) so the first-run setup can reuse it — SettingsPage is
 *  lazy-loaded, so its CSS chunk isn't present during the gated setup. */
export function AuroraRadio({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`aurora-radio ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <span className="aurora-radio__ring">{active && <span className="aurora-radio__dot" />}</span>
      <span>{label}</span>
    </button>
  );
}
