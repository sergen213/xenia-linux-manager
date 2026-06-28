import { useAuroraPrefs } from "../../theme/auroraPrefs";
import "./AuroraField.css";

/**
 * The Aurora "light field" background: a radial base gradient, a soft horizon
 * band, three slowly drifting caustic blobs, a vignette, and a top sheen. All
 * colors come from the --au-field-* tokens (theme + tint scoped in app.css).
 * Drift is disabled when Ambient motion is off; prefers-reduced-motion is
 * handled globally in app.css.
 */
export function AuroraField() {
  const { prefs } = useAuroraPrefs();
  const animated = prefs.ambientMotion ? "is-animated" : "";
  return (
    <div className="aurora-field" aria-hidden>
      <div className="aurora-field__base" />
      <div className="aurora-field__horizon" />
      <div className={`aurora-field__blob aurora-field__blob--1 ${animated}`} />
      <div className={`aurora-field__blob aurora-field__blob--2 ${animated}`} />
      <div className={`aurora-field__blob aurora-field__blob--3 ${animated}`} />
      <div className="aurora-field__vignette" />
      <div className="aurora-field__sheen" />
    </div>
  );
}
