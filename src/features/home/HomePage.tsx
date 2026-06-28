import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibrary } from "../library/state/libraryStore";
import { useLaunchActions } from "../library/state/useLaunchActions";
import { useSettings } from "../settings/state/settingsStore";
import { fetchGameSynopsis } from "../library/api/libraryClient";
import { GameCase, CoverArt } from "../../components/aurora/GameCase";
import "./HomePage.css";

// Hero cover fills ~70% of the featured panel height (clamped) so it scales
// with the window instead of sitting tiny on a maximized screen.
function heroWidthFor(panelH: number): number {
  return Math.max(180, Math.min(340, Math.round(((panelH - 68) * 0.7) / 1.4)));
}

/** Aurora Home: featured "Continue playing" game + a "Jump back in" list,
 *  driven by real library cards (most-recently-played first). */
export function HomePage() {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const launchActions = useLaunchActions();
  const navigate = useNavigate();

  const cards = [...(state.browse?.cards ?? [])].sort(
    (a, b) => (b.last_played_at ?? 0) - (a.last_played_at ?? 0),
  );

  // Size the hero cover to the live panel height. Effect re-runs once cards
  // arrive (the featured panel — and its ref — only mounts then).
  const featRef = useRef<HTMLElement>(null);
  const [heroW, setHeroW] = useState(220);
  const hasCards = cards.length > 0;
  useEffect(() => {
    const el = featRef.current;
    if (!el) return;
    const measure = () => setHeroW(heroWidthFor(el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasCards]);

  // Fetch the featured game's synopsis (x360db, cached in the sidecar).
  const featuredId =
    (cards.find((c) => c.game_id === state.selectedGameId) ?? cards[0])?.game_id;
  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const [synopsis, setSynopsis] = useState<string | null>(null);
  useEffect(() => {
    setSynopsis(null);
    if (!featuredId || !libPath) return;
    let live = true;
    fetchGameSynopsis(libPath, featuredId)
      .then((r) => live && setSynopsis(r.synopsis))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [featuredId, libPath]);

  if (!cards.length) {
    return (
      <div className="home__empty">
        <h1>Welcome to Xenia Manager</h1>
        <p>Add a library source to start building your collection.</p>
        <button className="ui-button ui-button--primary" onClick={() => navigate("/")}>
          Open Library
        </button>
      </div>
    );
  }

  const featured =
    cards.find((c) => c.game_id === state.selectedGameId) ?? cards[0];
  const recents = cards.slice(0, 4);

  const focusInLibrary = (gameId: string) => {
    dispatch({ type: "SELECT_GAME", gameId });
    navigate("/");
  };

  const openDetails = () => {
    dispatch({ type: "SELECT_GAME", gameId: featured.game_id });
    dispatch({ type: "OPEN_DETAILS" });
    navigate("/");
  };

  return (
    <div className="home">
      <section className="home__featured" ref={featRef}>
        <div style={{ flex: "0 0 auto" }}>
          <GameCase card={featured} w={heroW} angle={-16} selected={false} />
        </div>
        <div>
          <div className="home__eyebrow">CONTINUE PLAYING</div>
          <div className="home__title">{featured.title}</div>
          <div className="home__meta">
            {featured.kind || featured.source_label} · {cards.indexOf(featured) + 1} of {cards.length}
          </div>
          {synopsis && <p className="home__synopsis">{synopsis}</p>}
          <div className="home__actions">
            <button
              className="ui-button ui-button--primary"
              disabled={state.playingGameId === featured.game_id}
              onClick={() => void launchActions.launchGameById(featured.game_id, true)}
            >
              {state.playingGameId === featured.game_id ? "● Playing" : "▶ Launch"}
            </button>
            <button className="ui-button" onClick={openDetails}>
              Details
            </button>
          </div>
        </div>
      </section>

      <section className="home__side">
        <div className="home__side-title">Jump back in</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {recents.map((card) => (
            <button key={card.game_id} type="button" className="home__rec" onClick={() => focusInLibrary(card.game_id)}>
              <div style={{ flex: "0 0 auto" }}>
                <CoverArt card={card} w={44} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="home__rec-title">{card.title}</div>
                <div className="home__rec-sub">
                  {card.last_played_at ? "Played recently" : "Not played yet"}
                </div>
              </div>
              <span className="home__rec-chev">›</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
