import type { SourceCatalog } from "../model/libraryTypes";
import "./ScanResultsSummary.css";

interface ScanResultsSummaryProps {
  catalogs: SourceCatalog[];
}

/**
 * Summarizes scan outcomes across all sources: total found, duplicates,
 * warnings, skipped, and scan status for the most recent scan per source.
 */
export function ScanResultsSummary({ catalogs }: ScanResultsSummaryProps) {
  const totals = catalogs.reduce(
    (acc, cat) => {
      if (cat.last_scan_summary) {
        acc.found += cat.last_scan_summary.found;
        acc.duplicates += cat.last_scan_summary.duplicates;
        acc.warnings += cat.last_scan_summary.warnings;
        acc.skipped += cat.last_scan_summary.skipped;
        acc.errors += cat.last_scan_summary.errors;
        acc.sourceCount += 1;
        if (cat.last_scan_summary.was_cancelled) {
          acc.cancelledCount += 1;
        }
      }
      return acc;
    },
    {
      found: 0,
      duplicates: 0,
      warnings: 0,
      skipped: 0,
      errors: 0,
      sourceCount: 0,
      cancelledCount: 0,
    },
  );

  if (totals.sourceCount === 0) {
    return (
      <div className="scan-summary">
        <div className="scan-summary__empty">
          No scan results yet. Run a scan to discover games.
        </div>
      </div>
    );
  }

  const hasPartialOutcomes =
    totals.cancelledCount > 0 || totals.errors > 0;

  return (
    <div className="scan-summary">
      <div className="scan-summary__header">
        <span className="scan-summary__title">Scan Results Summary</span>
        <span className="scan-summary__meta">
          {totals.sourceCount} source{totals.sourceCount !== 1 ? "s" : ""}{" "}
          scanned
        </span>
      </div>

      <div className="scan-summary__stats">
        <div className="scan-summary__stat">
          <span className="scan-summary__stat-value scan-summary__stat-value--found">
            {totals.found}
          </span>
          <span className="scan-summary__stat-label">Found</span>
        </div>

        <div className="scan-summary__stat">
          <span className="scan-summary__stat-value scan-summary__stat-value--duplicates">
            {totals.duplicates}
          </span>
          <span className="scan-summary__stat-label">Duplicates</span>
        </div>

        <div className="scan-summary__stat">
          <span className="scan-summary__stat-value scan-summary__stat-value--warnings">
            {totals.warnings}
          </span>
          <span className="scan-summary__stat-label">Warnings</span>
        </div>

        <div className="scan-summary__stat">
          <span className="scan-summary__stat-value scan-summary__stat-value--skipped">
            {totals.skipped}
          </span>
          <span className="scan-summary__stat-label">Skipped</span>
        </div>
      </div>

      {hasPartialOutcomes && (
        <div className="scan-summary__partial">
          {totals.cancelledCount > 0 && (
            <div className="scan-summary__partial-item">
              {totals.cancelledCount} scan
              {totals.cancelledCount !== 1 ? "s" : ""} cancelled (partial
              results preserved)
            </div>
          )}
          {totals.errors > 0 && (
            <div className="scan-summary__partial-item">
              {totals.errors} filesystem error
              {totals.errors !== 1 ? "s" : ""} encountered during scanning
            </div>
          )}
        </div>
      )}
    </div>
  );
}
