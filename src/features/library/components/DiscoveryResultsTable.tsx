import { useState, useMemo } from "react";
import type {
  DiscoveredCandidate,
  SourceCatalog,
  CandidateStatus,
} from "../model/libraryTypes";
import "./DiscoveryResultsTable.css";

interface DiscoveryResultsTableProps {
  catalogs: SourceCatalog[];
}

type FilterMode = "all" | "found" | "duplicate" | "warning" | "skipped";

/**
 * Tabular view of discovered candidates across all sources.
 * Supports filtering by status and shows confidence, kind, warnings,
 * and low-confidence ISO annotations.
 */
export function DiscoveryResultsTable({
  catalogs,
}: DiscoveryResultsTableProps) {
  const [filter, setFilter] = useState<FilterMode>("all");

  const allCandidates = useMemo(
    () => catalogs.flatMap((c) => c.candidates),
    [catalogs],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return allCandidates;
    return allCandidates.filter((c) => c.status === filter);
  }, [allCandidates, filter]);

  const counts = useMemo(() => {
    const map: Record<CandidateStatus | "all", number> = {
      all: allCandidates.length,
      found: 0,
      duplicate: 0,
      warning: 0,
      skipped: 0,
    };
    for (const c of allCandidates) {
      map[c.status]++;
    }
    return map;
  }, [allCandidates]);

  if (allCandidates.length === 0) {
    return (
      <div className="discovery-table">
        <div className="discovery-table__empty">
          No candidates discovered yet. Run a scan to find games.
        </div>
      </div>
    );
  }

  return (
    <div className="discovery-table">
      <div className="discovery-table__header">
        <span className="discovery-table__title">Discovered Candidates</span>
        <span className="discovery-table__count">
          {allCandidates.length} total
        </span>
      </div>

      <div className="discovery-table__filters">
        {(
          ["all", "found", "duplicate", "warning", "skipped"] as FilterMode[]
        ).map((mode) => (
          <button
            key={mode}
            className={`discovery-table__filter-btn${
              filter === mode ? " discovery-table__filter-btn--active" : ""
            }`}
            onClick={() => setFilter(mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)} ({counts[mode]})
          </button>
        ))}
      </div>

      <div className="discovery-table__list">
        {filtered.map((candidate, idx) => (
          <CandidateRow key={`${candidate.path}-${idx}`} candidate={candidate} />
        ))}
        {filtered.length === 0 && (
          <div className="discovery-table__empty">
            No candidates match the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: DiscoveredCandidate }) {
  const statusClass = `candidate-row__status--${candidate.status}`;
  const confidenceLabel =
    candidate.confidence === "high"
      ? "High"
      : candidate.confidence === "medium"
        ? "Medium"
        : "Low";

  const sizeLabel = formatSize(candidate.size_bytes);

  return (
    <div className={`candidate-row candidate-row--${candidate.status}`}>
      <div className="candidate-row__main">
        <div className="candidate-row__label">{candidate.label}</div>
        <div className="candidate-row__path">{candidate.path}</div>
        {candidate.warning && (
          <div className="candidate-row__warning">{candidate.warning}</div>
        )}
      </div>
      <div className="candidate-row__meta">
        <span
          className={`candidate-row__badge candidate-row__badge--${candidate.kind}`}
        >
          {candidate.kind.toUpperCase()}
        </span>
        <span className={`candidate-row__status ${statusClass}`}>
          {candidate.status}
        </span>
        <span
          className={`candidate-row__confidence candidate-row__confidence--${candidate.confidence}`}
        >
          {confidenceLabel}
        </span>
        <span className="candidate-row__size">{sizeLabel}</span>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
