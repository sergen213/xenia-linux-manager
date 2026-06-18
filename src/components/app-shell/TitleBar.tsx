import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import {
  hasWindowControls,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  onWindowMaximizeChange,
} from "../../platform/bridge";
import "./TitleBar.css";

export function TitleBar() {
  const controls = hasWindowControls();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    let active = true;
    let sawEvent = false;
    // Subscribe first; a live event always wins over the async mount seed.
    const unsub = onWindowMaximizeChange((m) => {
      sawEvent = true;
      setMaximized(m);
    });
    void windowIsMaximized().then((m) => {
      if (active && !sawEvent) setMaximized(m);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [controls]);

  return (
    <header className="titlebar" aria-label="Window title bar">
      <div
        className="titlebar__drag"
        data-testid="titlebar-drag"
        onDoubleClick={() => {
          if (controls) void windowToggleMaximize();
        }}
      >
        <span className="titlebar__title">Xenia Manager for Linux</span>
      </div>
      {controls && (
        <div className="titlebar__controls">
          <button
            type="button"
            className="titlebar__btn"
            aria-label="Minimize"
            onClick={() => void windowMinimize()}
          >
            <Minus size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="titlebar__btn"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => void windowToggleMaximize()}
          >
            {maximized ? (
              <Copy size={14} strokeWidth={2} aria-hidden />
            ) : (
              <Square size={14} strokeWidth={2} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="titlebar__btn titlebar__btn--close"
            aria-label="Close"
            onClick={() => void windowClose()}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </header>
  );
}
