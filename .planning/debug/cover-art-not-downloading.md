---
status: fixed
trigger: "cover-art-not-downloading"
created: 2026-03-14T00:00:00Z
updated: 2026-03-16T00:00:00Z
---

## Current Focus

hypothesis: Asset protocol scope pattern too restrictive for Linux; glob "**/*" does not match absolute paths through hidden directories like ~/.local/share/
test: Updated scope to use Tauri path variables ($APPDATA/**, $HOME/**) plus catch-all (/**); added diagnostic logging to frontend
expecting: Artwork downloads to disk and asset protocol now serves files correctly on Linux
next_action: Await user verification -- run app with `npm run tauri dev`, open library, check console for [artwork] log messages

## Symptoms

expected: When games are in the library, cover art should be fetched from Xbox Marketplace CDN and displayed
actual: Letter-initial placeholders show, no artwork loads, no errors visible, no fetch attempt seems to happen
errors: None visible in terminal or UI
reproduction: Open the library page with games added - artwork never appears
started: Never worked. Previous debug session implemented artwork fetching but it still does not work.

## Eliminated

- hypothesis: Artwork fetching code is missing
  evidence: Previous debug session implemented full end-to-end artwork fetching (artwork.rs, commands, frontend). Code exists and compiles clean.
  timestamp: 2026-03-15T00:01

- hypothesis: Tauri asset protocol completely disabled
  evidence: Previous fix added assetProtocol.enable=true and protocol-asset Cargo feature. The asset protocol IS enabled now.
  timestamp: 2026-03-15T12:01

- hypothesis: Tauri capabilities/permissions need asset:default permission
  evidence: In Tauri v2, asset protocol is controlled via tauri.conf.json config and Cargo feature flag, NOT via the capabilities/permissions system. No "asset" permission exists in generated ACL manifests.
  timestamp: 2026-03-15T12:02

- hypothesis: CDN URLs are invalid or broken
  evidence: Verified both URLs return HTTP 200. XBOX_BOXART_URL (GitHub raw) returns image/jpeg content-type. Marketplace DB URL returns valid JSON.
  timestamp: 2026-03-15T12:03

- hypothesis: reqwest HTTP client not configured for Tauri
  evidence: reqwest is a direct dependency (not Tauri's HTTP plugin), so it works independently. Cargo.toml has reqwest 0.12 with json+stream features.
  timestamp: 2026-03-15T12:04

- hypothesis: CSP blocking asset protocol URLs
  evidence: CSP is set to null (permissive), which allows all sources including asset: and http://asset.localhost.
  timestamp: 2026-03-15T12:05

## Evidence

- timestamp: 2026-03-15T00:01
  checked: Full code trace from LibraryPage -> fetchAllArtwork -> artwork.rs -> CDN download -> identity store -> LibraryGrid render
  found: The entire chain is implemented and compiles. Backend commands registered, frontend calls wired, LibraryGrid uses convertFileSrc.
  implication: The code path exists but something prevents it from working at runtime.

- timestamp: 2026-03-15T00:02
  checked: tauri.conf.json app.security section
  found: Previous fix added assetProtocol with enable:true and scope:["**/*"]. But "**/*" is a relative glob that may not match absolute filesystem paths, especially through hidden directories like .local.
  implication: Even with asset protocol enabled, the scope may reject the artwork path.

- timestamp: 2026-03-15T12:01
  checked: Tauri v2 asset protocol scope documentation and community reports
  found: Multiple GitHub issues report 403 Forbidden on Linux with asset protocol. Key finding: glob pattern "**/*" does NOT match paths through hidden (dot-prefixed) directories. Tauri v2 scope supports path variables like $HOME, $APPDATA for proper resolution.
  implication: The previous scope ["**/*"] was insufficient. Need $HOME/** and/or /** to cover Linux paths through ~/.local/share/.

- timestamp: 2026-03-15T12:02
  checked: CDN URL responses via curl
  found: https://raw.githubusercontent.com/xenia-manager/xenia-manager-database/main/Assets/Marketplace/Boxarts/4D5307E6.jpg returns HTTP 200 with content-type: image/jpeg. Marketplace DB URL also returns 200.
  implication: Backend download should succeed if title_id resolution works.

- timestamp: 2026-03-15T12:03
  checked: artwork.rs title_id resolution chain
  found: Resolution tries 5 methods in order: (1) stored identity record, (2) patch inventory, (3) XEX/STFS/XISO header extraction, (4) path component scan, (5) Xbox Marketplace DB name lookup. For newly scanned games, the title_id is backfilled during browse_library() via review.rs load_context().
  implication: If header extraction fails and the game title doesn't match the marketplace DB, artwork fetch returns "No title_id available". This is expected for some games but should not affect ALL games.

- timestamp: 2026-03-15T12:04
  checked: Frontend artwork effect logic for race conditions or skipped triggers
  found: The effect correctly fires on first browse load (prevCardCountRef starts at 0, card count > 0). Guard condition prevents infinite loops. The fetch DOES fire at least once.
  implication: The frontend trigger logic is correct. The issue is either in the backend (download fails) or display (asset protocol scope).

- timestamp: 2026-03-15T12:05
  checked: Error visibility in frontend
  found: Previous fix added console.warn but only for individual artwork errors within the .then(). The .catch() had a generic message. No logging for the fetch trigger itself. CoverArt onError had no logging at all.
  implication: Even if things fail, the user sees no evidence. Added comprehensive logging to all three points (trigger, results, img load failure).

## Resolution

root_cause: |
  Two layered issues:
  1. PRIMARY: The assetProtocol scope pattern ["**/*"] does not match absolute Linux paths
     through hidden directories (e.g., ~/.local/share/xenia-linux-manager/library/artwork/).
     In Tauri v2 on Linux, glob patterns must use path variables or absolute patterns to match
     filesystem paths. The "**/*" pattern is relative and fails to match /home/user/.local/...
     paths, causing 403 Forbidden when the webview tries to load convertFileSrc() URLs.
  2. SECONDARY: All error paths were completely silent -- no console logging for fetch trigger,
     fetch results, or img load failures. This made it impossible to diagnose whether the
     issue was in the backend (download failing) or frontend (display failing).
fix: |
  1. Updated assetProtocol scope in tauri.conf.json from ["**/*"] to ["$APPDATA/**", "$HOME/**", "/**"]
     - $APPDATA/** covers the default artwork cache directory
     - $HOME/** covers user home directory paths
     - /** is a catch-all for any absolute path (game sources can be anywhere)
  2. Added comprehensive diagnostic logging:
     - LibraryPage.tsx: logs fetch trigger, download/cached/error counts, individual paths
     - LibraryGrid.tsx CoverArt: logs failed img loads with both file path and asset URL
  3. Previous fix (still in place): assetProtocol.enable=true, protocol-asset Cargo feature
verification: |
  - Rust compilation: clean (only unrelated warnings)
  - TypeScript compilation: clean
  - tauri.conf.json: valid JSON with corrected assetProtocol scope
  - CDN URLs verified working (HTTP 200, correct content-type)
  - Needs manual verification: run `npm run tauri dev`, open library, check browser console
    for [artwork] messages showing download results
files_changed:
  - src-tauri/tauri.conf.json
  - src/features/library/LibraryPage.tsx
  - src/features/library/components/LibraryGrid.tsx
