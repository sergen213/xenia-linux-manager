import { type ReactNode } from "react";

/** Aurora Details overlay (the "Y" window). Holds the real GameDetailsPanel
 *  so all patch / profile / content / save / launch wiring is reused. */
export function DetailsModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="aurora-modal" onClick={onClose}>
      <div
        className="aurora-modal__panel"
        role="dialog"
        aria-modal="true"
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
