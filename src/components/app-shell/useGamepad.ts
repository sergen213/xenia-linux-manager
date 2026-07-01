import { useEffect, useRef } from "react";
import { readAxisDir, rotateDelta, scrollDelta, type Dir } from "./spatialNav";

export interface GamepadHandlers {
  /** Edge-triggered controller button press (standard-mapping index). */
  onButton: (index: number) => void;
  /** Left-stick step — armed, deadzoned and rate-capped. */
  onAxisDir: (dir: Dir) => void;
  /** Right-stick Y analog scroll — per-frame px delta while the stick is held. */
  onScroll: (dy: number) => void;
  /** Right-stick X analog spin — per-frame degree delta while the stick is held. */
  onRotate?: (dx: number) => void;
  /** Fired once when the right stick X returns to rest after spinning (ease home). */
  onRotateEnd?: () => void;
}

/**
 * Standard-mapping gamepad driver. Polls via rAF only while a pad is connected
 * (keyboard/mouse users pay no perpetual cost), tracks button edges + analog
 * stick arming, and calls the supplied handlers — read through a ref so this
 * mount-once loop always sees the latest closures. Marks `using-controller` on
 * the body for any pad input and clears it on mouse move, so focus rings show
 * only while steering by controller.
 *
 * Shared by AppShell and the gated FirstRunSetup (which renders outside the
 * shell and would otherwise have no controller support at all).
 */
export function useGamepad(handlers: GamepadHandlers): void {
  const ref = useRef(handlers);
  // Keep the latest closures available to the mount-once poller below.
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    let raf = 0;
    let polling = false;
    let prev: Record<number, boolean> = {};
    // The first poll after (re)start adopts the live button state without firing
    // any edges, so a button still held from a prior screen — e.g. the A that
    // confirmed first-run "Finish" — isn't re-read as a fresh press by this newly
    // mounted loop (which would otherwise launch the focused game).
    let primed = false;
    // Analog steering. `axisArmed` only becomes true once the stick is seen at
    // rest, so a stuck/mismapped axis already deflected at startup never steers;
    // `axisNextFire` caps the rate so a noisy axis can't spam moveFocus and lock
    // the UI. New direction waits AXIS_DELAY before repeating; held repeats at
    // AXIS_RATE.
    let axisDir: Dir | null = null;
    let axisArmed = false;
    let axisNextFire = 0;
    const AXIS_DELAY = 350; // ms before a held stick starts auto-repeating
    const AXIS_RATE = 140; // ms between repeats (also the anti-spam floor)
    // Right stick (axes 2/3) scrolls (Y) and spins the focused 3D case (X). Like
    // the left stick each axis only arms once seen at rest, so a pad that
    // rests/mismaps the right stick at ±1 neither scrolls nor spins.
    let scrollArmed = false;
    let rotateArmed = false;
    let rotating = false;
    const mark = () => document.body.classList.add("using-controller");
    const anyConnected = () =>
      [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean);
    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp: Gamepad | null = null;
      for (const p of pads) {
        if (p) {
          gp = p;
          break;
        }
      }
      if (gp) {
        const g = gp;
        const h = ref.current;
        const now: Record<number, boolean> = {};
        for (let i = 0; i < g.buttons.length; i++) {
          now[i] = !!g.buttons[i]?.pressed;
        }
        if (!primed) {
          primed = true; // adopt held buttons silently — no edge this frame
        } else {
          for (let i = 0; i < g.buttons.length; i++) {
            if (now[i] && !prev[i]) {
              mark();
              h.onButton(i);
            }
          }
        }
        prev = now;

        // Left stick steers, with a deadzone, arming, and a rate cap (above).
        const t = performance.now();
        const dir = readAxisDir(g.axes);
        if (!dir) {
          axisArmed = true; // stick at rest — safe to honor the next push
          axisDir = null;
        } else if (axisArmed && t >= axisNextFire) {
          mark();
          h.onAxisDir(dir);
          axisNextFire = t + (dir === axisDir ? AXIS_RATE : AXIS_DELAY);
          axisDir = dir;
        }

        // Right stick (axis 3) scrolls the active region every frame it's held.
        const dy = scrollDelta(g.axes[3] ?? 0);
        if (dy === 0) {
          scrollArmed = true; // stick at rest — safe to honor the next push
        } else if (scrollArmed) {
          mark();
          h.onScroll(dy);
        }

        // Right stick (axis 2) spins the focused coverflow case every frame held;
        // releasing it (back to rest) fires onRotateEnd once so the case eases home.
        const dx = rotateDelta(g.axes[2] ?? 0);
        if (dx === 0) {
          rotateArmed = true; // stick at rest — safe to honor the next push
          if (rotating) {
            rotating = false;
            h.onRotateEnd?.();
          }
        } else if (rotateArmed) {
          mark();
          h.onRotate?.(dx);
          rotating = true;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    const start = () => {
      if (polling) return;
      polling = true;
      raf = requestAnimationFrame(poll);
    };
    const stop = () => {
      polling = false;
      cancelAnimationFrame(raf);
      prev = {};
      primed = false;
      axisDir = null;
      axisArmed = false;
      axisNextFire = 0;
      scrollArmed = false;
      rotateArmed = false;
      rotating = false;
    };
    const onDisconnect = () => {
      if (!anyConnected()) stop();
    };
    // Mouse use hides the focus rings again until the next controller input.
    const onMouse = () => document.body.classList.remove("using-controller");
    if (anyConnected()) start();
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    window.addEventListener("mousemove", onMouse);
    return () => {
      stop();
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);
}
