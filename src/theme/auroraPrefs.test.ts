import { describe, it, expect } from "vitest";
import { clampZoom, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "./auroraPrefs";

describe("clampZoom", () => {
  it("clamps to exactly ZOOM_MIN/ZOOM_MAX at the ends", () => {
    // Boundary disable checks use `<= ZOOM_MIN` / `>= ZOOM_MAX`, so the clamped
    // value must equal the bound exactly (no float drift past it).
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX);
    expect(clampZoom(ZOOM_MIN) <= ZOOM_MIN).toBe(true);
    expect(clampZoom(ZOOM_MAX) >= ZOOM_MAX).toBe(true);
  });

  it("snaps to the nearest step", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1 + ZOOM_STEP)).toBe(1 + ZOOM_STEP);
    expect(clampZoom(1.07)).toBe(1); // rounds down to nearest 0.2 step
    expect(clampZoom(1.13)).toBe(1.2); // rounds up
  });

  it("steps from min stay enabled-able (drift-free)", () => {
    // Repeated +step from min lands on clean multiples, not 0.6000001.
    let z = ZOOM_MIN;
    z = clampZoom(z + ZOOM_STEP);
    expect(z).toBe(0.8);
    z = clampZoom(z - ZOOM_STEP);
    expect(z).toBe(ZOOM_MIN);
  });
});
