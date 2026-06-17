import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LibraryGrid } from "../components/LibraryGrid";

vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

const cards = [
  {
    game_id: "game-1",
    title: "Forza",
    executable_path: "/games/forza/default.xex",
    source_id: "src-1",
    source_label: "Games",
    kind: "xex",
    confidence: "high",
    artwork_path: null,
    manual: false,
    review_flag: false,
    duplicate_badge_count: 0,
    last_played_at: null,
  },
];

describe("LibraryGrid", () => {
  it("defaults to double-click activation", () => {
    const onSelectGame = vi.fn();
    const onActivateGame = vi.fn();

    render(
      <LibraryGrid
        cards={cards}
        selectedGameId={null}
        onSelectGame={onSelectGame}
        onActivateGame={onActivateGame}
      />,
    );

    const card = screen.getByRole("button", { name: /Forza/i });
    fireEvent.click(card);
    expect(onSelectGame).toHaveBeenCalledWith("game-1");
    expect(onActivateGame).not.toHaveBeenCalled();

    fireEvent.doubleClick(card);
    expect(onActivateGame).toHaveBeenCalledWith("game-1");
  });

  it("serves artwork via the asset protocol with native lazy-loading", () => {
    render(
      <LibraryGrid
        cards={[{ ...cards[0], artwork_path: "/art/forza.jpg" }]}
        selectedGameId={null}
        onSelectGame={vi.fn()}
      />,
    );

    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("xlm-asset://local/%2Fart%2Fforza.jpg");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });
});
