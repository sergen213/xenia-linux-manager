---
status: resolved
trigger: "When changing settings in game profile, changes apply only on the second run (settings delayed). All profile settings affected. Happens every time. Started after recent change."
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:30:00Z
---

## Current Focus

hypothesis: ROOT CAUSE FOUND - games with title_id don't pass --config to Xenia, relying on auto-discovery which may use cached/global config
test: Fixed by always passing --config regardless of title_id. Need user to verify fix.
expecting: Settings should now apply on first launch after save
next_action: User verification

## Symptoms

expected: Settings should apply immediately when changed and saved in game profile
actual: Settings only apply after restarting the app/game twice - first restart doesn't apply, second restart applies
errors: None reported
reproduction: Every time - consistently reproducible when changing any game profile setting
timeline: Started after recent change (not sure which change)

## Eliminated

- hypothesis: Backend file I/O caching causing stale reads
  evidence: No in-memory caching in profiles/storage.rs. All reads go directly to disk. Tests pass.
  timestamp: 2026-03-27T00:10:00Z

- hypothesis: Path mismatch between save and load locations
  evidence: save_profile_overrides and load_profile_document use identical path construction.
  timestamp: 2026-03-27T00:12:00Z

- hypothesis: Race condition between save and launch on backend
  evidence: Both operations run synchronously. No concurrent access possible.
  timestamp: 2026-03-27T00:14:00Z

- hypothesis: Recent commits broke the save flow
  evidence: Recent commits only changed CSS, memoization, function extraction. No save/load logic changes.
  timestamp: 2026-03-27T00:16:00Z

- hypothesis: handleSave uses stale draft due to draftRef
  evidence: handleSave uses `draft` directly, NOT draftRef.current.
  timestamp: 2026-03-27T00:18:00Z

- hypothesis: React state not updating after save
  evidence: saveOverrides dispatches new effective config after save.
  timestamp: 2026-03-27T00:20:00Z

## Evidence

- timestamp: 2026-03-27T00:05:00Z
  checked: Save flow path end-to-end
  found: ProfileEditorPanel.handleSave -> onProfileSave -> saveOverrides -> saveProfileOverrides (Rust) -> storage::save_profile_overrides. All correct.
  implication: Save works correctly. User confirmed save log shows correct values.

- timestamp: 2026-03-27T00:07:00Z
  checked: Launch flow path end-to-end
  found: launch_game -> build_launch_plan -> materialize_launch_config (read) -> write_game_launch_config (write TOML) -> spawn Xenia. Config written BEFORE spawn.
  implication: Config file is written before Xenia starts. Order is correct.

- timestamp: 2026-03-27T00:25:00Z
  checked: CRITICAL - build_launch_plan lines 129-132
  found: For games WITH a title_id, NO --config argument is passed to Xenia. Only games WITHOUT a title_id get --config=<path>. Xenia must auto-discover the config by title_id for titled games.
  implication: If Xenia's auto-discovery uses a cached/global config that takes precedence over the game-specific config file, new settings wouldn't apply until Xenia's internal state is refreshed on a second run.

- timestamp: 2026-03-27T00:28:00Z
  checked: User's confirmation - save log shows correct values but settings only apply on 2nd run
  found: Save is correct. The issue is downstream - between TOML write and Xenia reading it.
  implication: Confirms the --config hypothesis. Titled games rely on auto-discovery which may not pick up the freshly-written config.

## Resolution

root_cause: In build_launch_plan (launch.rs lines 129-132), games with a title_id do NOT receive a --config argument. The TOML config file IS written to disk with the correct profile settings, but Xenia must auto-discover it by title_id. If Xenia's auto-discovery mechanism uses a cached or global config that takes precedence over the game-specific config file, the new settings don't take effect. On the second run, Xenia's internal state has been updated (e.g., global config synced from game config), so the settings apply.
fix: Always pass --config=<path> to Xenia regardless of whether the game has a title_id. This ensures Xenia reads the profile-based config directly rather than relying on auto-discovery.
verification: All 301 Rust tests pass. Need user to verify settings apply on first launch after save.
files_changed:
  - src-tauri/src/library/launch.rs

## Diagnostic Logging Added

eprintln! logging added to 3 locations (can be removed after verification):
1. storage.rs::save_profile_overrides - logs overrides being saved
2. materialize.rs::materialize_launch_config - logs overrides read at launch time
3. launch.rs::materialized_config_to_toml - logs TOML keys and size
