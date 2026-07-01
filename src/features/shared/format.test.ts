import { describe, it, expect } from "vitest";
import { displayTitle, formatBytes } from "./format";

describe("displayTitle", () => {
  it("strips region tags but keeps disc-type hints", () => {
    expect(displayTitle("Dragon's Dogma (World) (Install)")).toBe("Dragon's Dogma (Install)");
    expect(displayTitle("Halo 3 (USA)")).toBe("Halo 3");
    expect(displayTitle("Forza Motorsport 4 (USA, Europe)")).toBe("Forza Motorsport 4");
    expect(displayTitle("Game (En,Fr,De,Es,It) (Play)")).toBe("Game (Play)");
    expect(displayTitle("Game (NTSC) (Disc 1)")).toBe("Game (Disc 1)");
  });

  it("keeps groups that aren't pure region/language tags", () => {
    expect(displayTitle("Game (Demo)")).toBe("Game (Demo)");
    expect(displayTitle("Game [!]")).toBe("Game [!]");
    expect(displayTitle("No Tags Here")).toBe("No Tags Here");
  });

  it("collapses the whitespace a stripped tag leaves behind", () => {
    expect(displayTitle("A (USA)  B")).toBe("A B");
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
