---
name: run-app
description: Build, run, and drive the Xenia Linux Manager desktop app. Use when asked to start the app, screenshot its UI, preview a theme/design change, or interact with it. Two modes — a headless themed preview (browser + stubbed bridge, no display) and the real Electron app (sidecar + window).
---

Xenia Linux Manager is an Electron + React app. The renderer talks to a Rust
sidecar (`xlm-core`) through the `window.xlm` bridge (`src/platform/bridge.ts`),
which Electron's preload injects. Two ways to run it:

- **Themed preview** — render the real renderer build in a plain browser with a
  **stubbed `window.xlm`**. No sidecar, no display, no window. Use this for
  design/theme work and screenshots (CI-safe). This is what you almost always want.
- **Real app** — build the sidecar and launch Electron. Real data, opens a window
  on a display. Use when you need real library/task data.

All paths are relative to the repo root.

## Mode A — Themed preview (headless, stubbed)

```bash
npm run build                                   # out/renderer with current CSS/TSX
node .claude/skills/run-app/preview.mjs --serve 8771
```

Then drive it with the Playwright MCP browser tools (or just open the URL):

- `browser_navigate http://localhost:8771/index.html` → boots to `/settings`.
- It's a **BrowserRouter** served by a static server, so direct loads of
  `/library` etc. 404. Navigate **client-side** instead, e.g. via `browser_evaluate`:
  ```js
  () => [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/library').click()
  ```
  Routes: `/` (Dashboard), `/library`, `/saves`, `/tasks`, `/settings`.
- `browser_take_screenshot` after each nav. Always check
  `browser_console_messages level=error` — a render throw blanks the whole tree
  (no error boundary), so a "good" screenshot needs a clean console.

The stub lives in `preview.mjs` (`window.xlm.invoke` → per-method shapes). It
fakes: settings with `setup_complete: true` (skips first-run), one *installed*
Canary build (rich Xenia card), empty everything else (real empty states). If a
screen throws `reading 'X' of undefined`, a provider wants a shape the stub
doesn't return — add it to `H` in `preview.mjs` and rebuild.

### Gotchas (already handled in the stub — keep them)
- **`StatusBar` reads `ReleaseMetadata.updater.available`.** The always-mounted
  status bar crashes the whole app if `get_release_metadata` lacks a nested
  `updater` object. → stub returns `META.updater = READY`.
- **`LibraryProvider` reads `get_library_status` → `{ sources, active_scans,
  queued_scans }`.** Returning `{}` makes `state.sources` undefined and the
  Dashboard's `sources.length` throws. → stub returns the full object.
- **Screenshots from the Playwright MCP land at the repo root** (e.g.
  `./xlm-01.png`), not in `.playwright-mcp/`. Clean them up after.

## Mode B — Real Electron app (sidecar + window)

Needs a display (`DISPLAY` / Wayland) and the Rust toolchain.

```bash
cargo build --release --bin xlm-core --manifest-path core/Cargo.toml   # ~minutes cold; sidecar binary
npm run dev    # electron-vite: renderer dev server + Electron; main spawns the sidecar
```

- The sidecar binary is resolved by `electron/main/paths.ts`:
  `core/target/release/xlm-core` (or `…/debug/…`). If missing, `npm run dev`
  throws `xlm-core not found`. → run the cargo build above.
- `npm run dev` is long-running; background it. The window opens on the active
  display. Sidecar stdout/stderr is prefixed `[xlm-core]` in the dev log.
- No `playwright-core` is installed, so there's no scripted screenshot path for
  the real window — a human watches the screen, or add `playwright-core` +
  `_electron.launch({ executablePath: node_modules/electron/dist/electron })`
  under xvfb if you need automated capture.

## Troubleshooting
- **Blank preview / tiny screenshot** → render threw; check the error console,
  fix the stub shape, `node preview.mjs` again, reload.
- **`xlm-core not found`** → `cargo build --release --bin xlm-core --manifest-path core/Cargo.toml`.
- **No window in Mode B** → `DISPLAY` unset, or launched from a non-graphical
  session. Launch from the desktop session (or `! npm run dev` in Claude Code).
