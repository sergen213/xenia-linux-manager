// Themed-preview harness for Xenia Linux Manager.
//
// Renders the REAL renderer build in a plain browser by stubbing the
// `window.xlm` Electron bridge — so you can screenshot the UI / theme on a
// headless box without building the Rust sidecar or opening a window.
//
// Usage:
//   npm run build                       # produce out/renderer with current CSS
//   node .claude/skills/run-app/preview.mjs            # build harness only
//   node .claude/skills/run-app/preview.mjs --serve 8771   # build + serve
//
// Then drive it (Playwright MCP, or just open the URL in a browser):
//   navigate http://localhost:8771/index.html   → boots to /settings
//   client-side nav only (BrowserRouter, no SPA fallback on a static server):
//     [...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/').click()
//
// The stub shapes below are reverse-engineered from the renderer's providers.
// If a screen throws "reading 'X' of undefined", a provider expects a shape the
// stub doesn't return yet — add it to H and rebuild. Known gotchas already
// handled: StatusBar reads ReleaseMetadata.updater.available; LibraryProvider
// reads get_library_status -> { sources, active_scans, queued_scans }.

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../../..");
const SRC = path.join(REPO, "out/renderer");
const DST = "/tmp/xlm-preview";

if (!fs.existsSync(path.join(SRC, "index.html"))) {
  console.error("No build at", SRC, "— run `npm run build` first.");
  process.exit(1);
}

const STUB = `
<script>
(function () {
  const S = {
    xenia_path: "/home/player/.local/share/xenia",
    app_data_path: "/home/player/.local/share/xenia-manager",
    library_metadata_path: "/home/player/.local/share/xenia-manager/library",
    setup_complete: true, last_active_route: "/settings",
    gamer_tag: "Player1", launch_environment: null, launch_wrapper: null,
  };
  const v = (p) => ({ path: p, valid: true, reason: null });
  const VAL = { xenia: v(S.xenia_path), app_data: v(S.app_data_path),
    library_metadata: v(S.library_metadata_path), warnings: [], all_valid: true };
  const m = { channel: "canary", build_id: "a1b2c3d", tag: "xenia-canary-2024.12.01",
    release_name: "Canary 2024.12.01", published_at: "2024-12-01T12:00:00Z", html_url: "#",
    asset_name: "xenia_canary.tar.gz", executable_path: "/x/xenia_canary",
    install_dir: "/x", installed_at: 1733054400000 };
  const INSTALL = { status: "installed", manifest: m, installed_builds: [m], failure: null };
  const READY = { available: false, reason: "Development build", is_packaged: false,
    has_pubkey: false, has_endpoints: false };
  const META = { version: "0.1.0", build_kind: "development", build_kind_label: "Development",
    architecture: "x86_64", release_notes_url: "#", updater: READY };
  const mkCard = (i, title) => ({ game_id: "g" + i, title,
    executable_path: "/games/g" + i + "/default.xex", source_id: "s1", source_label: "Games",
    kind: "Xbox 360", confidence: "high", artwork_path: null, manual: false, review_flag: false,
    duplicate_badge_count: 0, last_played_at: 1589155200000 - i * 86400000 });
  const CARDS = [
    "Peter Jackson's King Kong", "Halo 3", "Gears of War", "Forza Horizon",
    "Fable II", "Mass Effect", "Crackdown", "Banjo-Kazooie",
  ].map((t, i) => mkCard(i + 1, t));
  const CARD = CARDS[0];
  const DETAILS = { ...CARD, title_id: "4D5307D5", preferred_xenia_tag: null,
    launch_environment: null, launch_wrapper: null, duplicate_count: 0, issue_notes: [],
    running_session_started_at: null, evidence: [], scan_history: [] };
  const CONTENT = { game_id: "g1", game_title: CARD.title, title_id: "4D5307D5",
    content_root: "/x", exists: false, entries: [] };
  const H = {
    load_settings: () => [S, VAL], get_default_settings: () => S,
    validate_paths: () => VAL, save_settings: () => VAL,
    get_install_status: () => INSTALL, check_for_update: () => null, check_for_update_auto: () => null,
    get_release_metadata: () => META, get_updater_readiness: () => READY,
    get_environment_diagnostics: () => [], fetch_latest_release: () => null, fetch_recent_releases: () => [],
    get_library_status: () => ({ sources: [], active_scans: 0, queued_scans: 0 }),
    browse_library: () => ({ cards: CARDS, review_inbox_count: 0, review_duplicate_count: 0, review_low_confidence_count: 0 }),
    get_library_game_details: () => DETAILS, inspect_game_content: () => CONTENT,
    get_source_catalog: () => ({ candidates: [] }), get_all_catalogs: () => [],
    list_library_sources: () => [], list_save_backups: () => [], list_game_profiles: () => [],
    // TasksProvider reads history.jobs (LOAD_HISTORY_SUCCESS iterates it); a bare
    // [] makes .jobs undefined → "not iterable" blanks the whole app (no boundary).
    get_task_history: () => ({ jobs: [] }), load_task_history: () => ({ jobs: [] }),
    // FolderBrowser (in-app, controller-mode folder picker) expects a
    // { path, parent, entries } listing; the [] default breaks its shape.
    // No regex here — backslashes get eaten by the injected-script template.
    list_directory: (p) => {
      let path = (p && p.path) || "/home/player";
      if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
      const slash = path.lastIndexOf("/");
      const parent = path === "/" ? null : slash > 0 ? path.slice(0, slash) : "/";
      const base = path === "/" ? "" : path;
      const entries = ["Games", "Xbox360", "Saves", "Downloads"].map((name) => ({
        name,
        path: base + "/" + name,
      }));
      return { path, parent, entries };
    },
  };
  window.xlm = {
    invoke: (k, p) => Promise.resolve(H[k] ? H[k](p) : []),
    on: () => () => {}, convertFileSrc: (p) => p,
    openDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  };
})();
</script>
`;

fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true });
const idx = path.join(DST, "index.html");
let html = fs.readFileSync(idx, "utf8");
html = html.replace('<script type="module"', STUB + '    <script type="module"');
fs.writeFileSync(idx, html);
console.log("preview built:", DST, "| stub injected:", html.includes("window.xlm"));

const serveArg = process.argv.indexOf("--serve");
if (serveArg !== -1) {
  const port = Number(process.argv[serveArg + 1]) || 8771;
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".json": "application/json" };
  http.createServer((req, res) => {
    let f = path.join(DST, decodeURIComponent(req.url.split("?")[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DST, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log(`serving ${DST} at http://localhost:${port}/index.html`));
}
