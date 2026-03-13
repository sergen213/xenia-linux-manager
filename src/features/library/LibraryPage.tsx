import { LibrarySourcesPanel } from "./components/LibrarySourcesPanel";
import "./LibraryPage.css";

export function LibraryPage() {
  return (
    <div className="library-page">
      <header className="library-page__header">
        <h2 className="library-page__title">Library</h2>
        <p className="library-page__subtitle">
          Your Xbox 360 game collection
        </p>
      </header>

      <LibrarySourcesPanel />
    </div>
  );
}
