import { afterEach, describe, expect, it, vi } from "vitest";
import { moveFocus, activateFocused, focusables, readAxisDir, scrollDelta } from "./spatialNav";

// jsdom does no layout, so stub each element's rect to place it on a grid.
function place(el: HTMLElement, x: number, y: number, w = 40, h = 20) {
  el.getBoundingClientRect = () =>
    ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y }) as DOMRect;
}

function button(id: string, x: number, y: number) {
  const b = document.createElement("button");
  b.id = id;
  document.body.appendChild(b);
  place(b, x, y);
  return b;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("spatialNav.moveFocus", () => {
  it("picks the nearest focusable in the pressed direction", () => {
    const center = button("c", 100, 100);
    const right = button("r", 200, 100);
    const down = button("d", 100, 200);
    button("left", 0, 100);
    center.focus();

    moveFocus("right", document.body);
    expect(document.activeElement).toBe(right);

    center.focus();
    moveFocus("down", document.body);
    expect(document.activeElement).toBe(down);
  });

  it("returns null when nothing lies that way", () => {
    const only = button("only", 100, 100);
    only.focus();
    expect(moveFocus("up", document.body)).toBeNull();
  });

  it("never steers into reel cells", () => {
    const reel = document.createElement("div");
    reel.className = "aurora-grid";
    document.body.appendChild(reel);
    const cell = document.createElement("button");
    reel.appendChild(cell);
    place(cell, 200, 100);

    const here = button("here", 100, 100);
    here.focus();
    expect(focusables(document.body)).not.toContain(cell);
    expect(moveFocus("right", document.body)).toBeNull();
  });
});

describe("spatialNav.readAxisDir", () => {
  it("returns null inside the deadzone", () => {
    expect(readAxisDir([0.1, -0.2, 0, 0])).toBeNull();
    expect(readAxisDir([])).toBeNull();
  });

  it("reads the left stick (axes 0/1), dominant axis wins", () => {
    expect(readAxisDir([0.9, 0, 0, 0])).toBe("right");
    expect(readAxisDir([-0.9, 0, 0, 0])).toBe("left");
    expect(readAxisDir([0, 0.9, 0, 0])).toBe("down");
    expect(readAxisDir([0, -0.9, 0, 0])).toBe("up");
    expect(readAxisDir([0.9, 0.4, 0, 0])).toBe("right"); // |x| >= |y|
  });

  it("ignores other axes (hat 6/7, right stick 2/3) to avoid stuck-axis drift", () => {
    expect(readAxisDir([0, 0, 1, 1, 0, 0, 1, -1])).toBeNull();
  });
});

describe("spatialNav.activateFocused", () => {
  it("clicks the focused button", () => {
    const b = button("b", 0, 0);
    const onClick = vi.fn();
    b.addEventListener("click", onClick);
    b.focus();
    activateFocused();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("spatialNav.scrollDelta", () => {
  it("returns 0 inside the deadzone (so a resting/mismapped stick can't scroll)", () => {
    expect(scrollDelta(0)).toBe(0);
    expect(scrollDelta(0.15)).toBe(0);
    expect(scrollDelta(-0.19)).toBe(0);
  });
  it("scrolls down for +y and up for -y", () => {
    expect(scrollDelta(0.8)).toBeGreaterThan(0);
    expect(scrollDelta(-0.8)).toBeLessThan(0);
  });
  it("reaches full speed at the rim and ramps monotonically", () => {
    expect(scrollDelta(1)).toBe(22);
    expect(scrollDelta(-1)).toBe(-22);
    expect(scrollDelta(0.9)).toBeLessThan(scrollDelta(1));
    expect(scrollDelta(0.4)).toBeLessThan(scrollDelta(0.7));
  });
});
