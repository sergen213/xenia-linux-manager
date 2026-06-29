import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Aurora Details overlay (the "Y" window). Holds the real GameDetailsPanel
 *  so all patch / profile / content / save / launch wiring is reused.
 *  Hardened: named dialog, Escape closes, focus is trapped inside while open
 *  and restored to the opener on close. */
export function DetailsModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture + stop so AppShell's global Escape (navigates home) doesn't
        // also fire — matches FolderBrowser's pattern.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="aurora-modal" onClick={onClose}>
      <div
        ref={panelRef}
        className="aurora-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Game details"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="aurora-modal__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="aurora-modal__body">{children}</div>
      </div>
    </div>
  );
}
