import { convertFileSrc } from "@tauri-apps/api/core";
import { memo, useState } from "react";
import type { LibraryBrowseCard } from "../model/libraryTypes";

interface LibraryGridProps {
  cards: LibraryBrowseCard[];
  selectedGameId: string | null;
  onSelectGame: (gameId: string) => void;
  /** Callback when a game card is activated (double-click or single-click based on preference) */
  onActivateGame?: (gameId: string) => void;
  /** Click behavior setting: "single" = immediate activation, "double" = activate on double-click */
  clickBehavior?: "single" | "double";
}

function formatLastPlayed(timestamp: number | null): string {
  if (!timestamp) {
    return "Never played";
  }

  return `Last played ${new Date(timestamp).toLocaleString()}`;
}

// Memoized to prevent re-renders when parent state changes but card props haven't.
// Artwork is served via the Tauri asset protocol (convertFileSrc) so the browser
// loads it natively: real lazy-loading (only when scrolled into view), native
// decode + caching, and no per-card readFile/Blob held on the JS heap. With large
// libraries the old eager readFile defeated loading="lazy" and pinned every cover
// in memory at once.
const CoverArt = memo(function CoverArt({ card }: { card: LibraryBrowseCard }) {
  // Track the path that failed, not a bare boolean: a re-resolved artwork_path
  // differs from failedPath and so automatically retries.
  const [failedPath, setFailedPath] = useState<string | null>(null);

  if (card.artwork_path && failedPath !== card.artwork_path) {
    return (
      <div className="library-grid__cover library-grid__cover--image" aria-hidden="true">
        <img
          src={convertFileSrc(card.artwork_path)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            console.warn(
              `[artwork] Failed to render image for "${card.title}":`,
              `path=${card.artwork_path}`,
            );
            setFailedPath(card.artwork_path);
          }}
        />
      </div>
    );
  }

  return (
    <div className="library-grid__cover" aria-hidden="true">
      <span>{card.title.slice(0, 1).toUpperCase()}</span>
    </div>
  );
});

// Memoized card component to optimize re-renders
interface GameCardProps {
  card: LibraryBrowseCard;
  isSelected: boolean;
  onSelectGame: (gameId: string) => void;
  onActivateGame?: (gameId: string) => void;
  clickBehavior: "single" | "double";
}

const GameCard = memo(function GameCard({
  card,
  isSelected,
  onSelectGame,
  onActivateGame,
  clickBehavior,
}: GameCardProps) {
  const handleClick = () => {
    onSelectGame(card.game_id);
    if (clickBehavior === "single" && onActivateGame) {
      onActivateGame(card.game_id);
    }
  };

  const handleDoubleClick = () => {
    onSelectGame(card.game_id);
    if (onActivateGame) {
      onActivateGame(card.game_id);
    }
  };

  return (
    <button
      type="button"
      className={`library-grid__card${isSelected ? " library-grid__card--selected" : ""}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <CoverArt card={card} />
      <div className="library-grid__content">
        <div className="library-grid__title-row">
          <h3 className="library-grid__title">{card.title}</h3>
          {card.manual && <span className="library-grid__badge">Manual</span>}
        </div>
        <p className="library-grid__meta">{card.source_label}</p>
        <p className="library-grid__meta">{formatLastPlayed(card.last_played_at)}</p>
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific fields change
  return (
    prevProps.card.game_id === nextProps.card.game_id &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.artwork_path === nextProps.card.artwork_path &&
    prevProps.card.source_label === nextProps.card.source_label &&
    prevProps.card.last_played_at === nextProps.card.last_played_at &&
    prevProps.card.manual === nextProps.card.manual &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelectGame === nextProps.onSelectGame &&
    prevProps.onActivateGame === nextProps.onActivateGame &&
    prevProps.clickBehavior === nextProps.clickBehavior
  );
});

export function LibraryGrid({
  cards,
  selectedGameId,
  onSelectGame,
  onActivateGame,
  clickBehavior = "double",
}: LibraryGridProps) {
  if (cards.length === 0) {
    return (
      <div className="library-page__empty-state">
        No resolved titles yet. Scan a source or manually add a game to start
        curating your library.
      </div>
    );
  }

  return (
    <div className="library-grid" role="list" aria-label="Resolved library">
      {cards.map((card) => (
        <GameCard
          key={card.game_id}
          card={card}
          isSelected={selectedGameId === card.game_id}
          onSelectGame={onSelectGame}
          onActivateGame={onActivateGame}
          clickBehavior={clickBehavior}
        />
      ))}
    </div>
  );
}
