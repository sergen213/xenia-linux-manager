import { useLibrary } from "./state/libraryStore";
import { LibrarySourcesPanel } from "./components/LibrarySourcesPanel";
import { ScanResultsSummary } from "./components/ScanResultsSummary";
import { DiscoveryResultsTable } from "./components/DiscoveryResultsTable";
import "./LibraryPage.css";

export function LibraryPage() {
  const { state } = useLibrary();

  return (
    <div className="library-page">
      <header className="library-page__header">
        <h2 className="library-page__title">Library</h2>
        <p className="library-page__subtitle">
          Your Xbox 360 game collection
        </p>
      </header>

      <LibrarySourcesPanel />

      <div className="library-page__section">
        <ScanResultsSummary catalogs={state.catalogs} />
      </div>

      <div className="library-page__section">
        <DiscoveryResultsTable catalogs={state.catalogs} />
      </div>
    </div>
  );
}
