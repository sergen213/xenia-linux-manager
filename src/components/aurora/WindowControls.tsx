import { Minus, Square, X } from "lucide-react";
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
} from "../../platform/bridge";
import "./WindowControls.css";

/**
 * Floating window controls for the seamless (frameless, no title-bar) window.
 * Sit in the top-right corner over the chrome; no-op gracefully without a host
 * (browser / themed preview).
 */
export function WindowControls() {
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__btn"
        aria-label="Minimize"
        onClick={() => void windowMinimize()}
      >
        <Minus size={15} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="window-controls__btn"
        aria-label="Maximize"
        onClick={() => void windowToggleMaximize()}
      >
        <Square size={12} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="window-controls__btn window-controls__btn--close"
        aria-label="Close"
        onClick={() => void windowClose()}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
