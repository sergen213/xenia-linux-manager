---
status: awaiting_human_verify
trigger: "When clicking install, Xenia is extracted to .local/share/xenia-linux-manager/data instead of .local/share/xenia-linux-manager/xenia/"
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - install_dir() appends "/xenia" to app_data_path, producing data/xenia/ instead of using the dedicated xenia_path setting
test: Trace full path from settings -> command -> install_dir
expecting: install target = {app_data_path}/xenia = data/xenia, should be {xenia_path} = xenia/
next_action: Fix install_state::install_dir and lifecycle pipeline to use xenia_path

## Symptoms

expected: Xenia binary/files should be extracted to ~/.local/share/xenia-linux-manager/xenia/
actual: Xenia binary/files are extracted to ~/.local/share/xenia-linux-manager/data (the app's data directory root)
errors: No error messages - it silently extracts to wrong path
reproduction: Click the install button in the UI
started: Unknown

## Eliminated

## Evidence

- timestamp: 2026-03-14T00:01:00Z
  checked: settings/path_defaults.rs
  found: xenia_path defaults to ~/.local/share/xenia-linux-manager/xenia, app_data_path defaults to ~/.local/share/xenia-linux-manager/data
  implication: These are two distinct paths - xenia binaries have their own dedicated path

- timestamp: 2026-03-14T00:02:00Z
  checked: xenia/install_state.rs install_dir()
  found: install_dir(app_data_path) returns PathBuf::from(app_data_path).join("xenia") = data/xenia
  implication: This appends /xenia to app_data_path instead of using the dedicated xenia_path setting

- timestamp: 2026-03-14T00:03:00Z
  checked: commands/xenia.rs run_lifecycle_pipeline
  found: Only app_data_path is passed to the pipeline. xenia_path from settings is never used for install target.
  implication: The entire install pipeline is unaware of the xenia_path setting

- timestamp: 2026-03-14T00:04:00Z
  checked: commands/xenia.rs start_install and XeniaLifecycleDialog.tsx
  found: Frontend passes settingsState.settings.app_data_path. No xenia_path param exists.
  implication: Need to add xenia_path parameter to install/update/retry commands

## Resolution

root_cause: install_state::install_dir() computes the install target as {app_data_path}/xenia (= data/xenia/) instead of using the settings.xenia_path (= xenia/). The lifecycle pipeline only receives app_data_path and never has access to xenia_path. Staging/downloads correctly use app_data_path, but the final install directory should use xenia_path.
fix: Changed install_dir() to use xenia_path directly instead of computing {app_data_path}/xenia. Threaded xenia_path parameter through promote_staged_build, rollback_promotion, remove_install, run_lifecycle_pipeline, and all Tauri commands (start_install, start_update, retry_last_operation, remove_xenia_install). Updated frontend xeniaClient.ts API functions and all component callers to pass xeniaPath from settings.
verification: cargo check passes (no errors). 43 relevant Rust tests pass. 180 frontend tests pass. Awaiting human verification of actual install behavior.
files_changed:
  - src-tauri/src/xenia/install_state.rs
  - src-tauri/src/xenia/lifecycle.rs
  - src-tauri/src/commands/xenia.rs
  - src/features/xenia/api/xeniaClient.ts
  - src/features/xenia/components/XeniaLifecycleDialog.tsx
  - src/features/xenia/components/XeniaRecoveryActions.tsx
  - src/features/tasks/TasksPage.tsx
