import { useState } from "react";
import type { ExportPreflight } from "../model/saveTypes";

interface SaveExportDialogProps {
  preflight: ExportPreflight;
  exportPending: boolean;
  onExport: (selectedLabels: string[] | null) => void;
  onCancel: () => void;
}

/**
 * Export dialog with item-level selection, size preview,
 * and blocker warnings. Supports selective or full export.
 */
export function SaveExportDialog({
  preflight,
  exportPending,
  onExport,
  onCancel,
}: SaveExportDialogProps) {
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(
    new Set(preflight.items.filter((i) => i.exists).map((i) => i.label)),
  );

  const allExisting = preflight.items.filter((i) => i.exists);
  const allSelected = allExisting.every((i) => selectedLabels.has(i.label));
  const noneSelected = selectedLabels.size === 0;

  const selectedSize = preflight.items
    .filter((i) => selectedLabels.has(i.label) && i.exists)
    .reduce((sum, i) => sum + i.size_bytes, 0);

  function toggleItem(label: string) {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedLabels(new Set());
    } else {
      setSelectedLabels(new Set(allExisting.map((i) => i.label)));
    }
  }

  function handleExport() {
    if (allSelected) {
      onExport(null);
    } else {
      onExport(Array.from(selectedLabels));
    }
  }

  return (
    <div className="save-export-dialog">
      <h4>Export saves: {preflight.game_title}</h4>

      {preflight.blockers.length > 0 && (
        <>
          <p className="saves-page__muted">
            Export cannot proceed due to the following issues:
          </p>
          <ul className="save-export-dialog__blockers">
            {preflight.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="save-wizard__actions">
            <button type="button" onClick={onCancel}>
              Close
            </button>
          </div>
        </>
      )}

      {preflight.blockers.length === 0 && (
        <>
          <p className="saves-page__muted">
            Select items to include in the export archive. All items are
            selected by default.
          </p>

          <div className="save-wizard__actions">
            <button type="button" onClick={toggleAll}>
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <ul className="save-export-dialog__items">
            {preflight.items.map((item) => (
              <li key={item.label} className="save-export-dialog__item">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedLabels.has(item.label)}
                    disabled={!item.exists}
                    onChange={() => toggleItem(item.label)}
                  />
                  <span>
                    {item.label}{" "}
                    <span className="saves-page__muted">({item.category})</span>
                  </span>
                </label>
                <span className="save-export-dialog__item-size">
                  {item.exists
                    ? `${(item.size_bytes / 1024).toFixed(1)} KB`
                    : "Not found"}
                </span>
              </li>
            ))}
          </ul>

          <p className="saves-page__muted">
            Selected: {selectedLabels.size} item
            {selectedLabels.size !== 1 ? "s" : ""} (
            {(selectedSize / 1024).toFixed(1)} KB)
          </p>

          <div className="save-wizard__actions">
            <button
              type="button"
              disabled={noneSelected || exportPending}
              onClick={handleExport}
            >
              {exportPending ? "Exporting..." : "Export selected"}
            </button>
            <button type="button" onClick={onCancel} disabled={exportPending}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
