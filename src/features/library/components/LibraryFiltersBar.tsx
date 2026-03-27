import type {
  LibraryFilterMode,
  LibrarySortMode,
} from "../state/libraryStore";
import { CustomSelect } from "./CustomSelect";

interface LibraryFiltersBarProps {
  search: string;
  sortMode: LibrarySortMode;
  filterMode: LibraryFilterMode;
  onSearchChange: (value: string) => void;
  onSortChange: (value: LibrarySortMode) => void;
  onFilterChange: (value: LibraryFilterMode) => void;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All library" },
  { value: "manual", label: "Manual entries" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Recently played" },
  { value: "title", label: "Title" },
  { value: "source", label: "Source" },
];

export function LibraryFiltersBar({
  search,
  sortMode,
  filterMode,
  onSearchChange,
  onSortChange,
  onFilterChange,
}: LibraryFiltersBarProps) {
  return (
    <section className="library-filters" aria-label="Library organizer controls">
      <div className="library-filters__search">
        <label className="library-filters__label" htmlFor="library-search">
          Search
        </label>
        <input
          id="library-search"
          className="library-filters__input"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search titles, sources, or paths"
        />
      </div>

      <div className="library-filters__group">
        <label className="library-filters__label">
          Filter
        </label>
        <CustomSelect
          className="library-filters__select"
          value={filterMode}
          options={FILTER_OPTIONS}
          onChange={(v) => onFilterChange(v as LibraryFilterMode)}
        />
      </div>

      <div className="library-filters__group">
        <label className="library-filters__label">
          Sort
        </label>
        <CustomSelect
          className="library-filters__select"
          value={sortMode}
          options={SORT_OPTIONS}
          onChange={(v) => onSortChange(v as LibrarySortMode)}
        />
      </div>

    </section>
  );
}
