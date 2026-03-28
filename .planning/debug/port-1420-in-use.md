---
status: resolved
trigger: "Tauri app cannot start because port 1420 is already in use"
created: 2026-03-27T12:00:00Z
updated: 2026-03-27T12:00:00Z
---

## Current Focus
hypothesis: Stale Vite dev server process from crashed/hung previous session
test: Kill process tree, verify port freed
expecting: Port 1420 becomes available
next_action: Kill process and verify

## Symptoms
expected: Tauri dev server starts on port 1420
actual: "Port already in use" error, app won't start
errors: "Port already in use" when launching Tauri dev server
reproduction: Try to run the Tauri dev server, get port conflict
started: Unknown — leftover from a previous session

## Evidence
- timestamp: 2026-03-27T12:00:00Z
  checked: lsof -i :1420
  found: PID 191671 (node-MainThread) listening on localhost:1420
- timestamp: 2026-03-27T12:00:00Z
  checked: Process command line
  found: `node /mnt/1st4TB/vscodiumprojects/xenialinuxmanager/node_modules/.bin/vite`
- timestamp: 2026-03-27T12:00:00Z
  checked: Parent process
  found: PID 191644 = `npm run dev`, parent PID 1507 (shell)
- timestamp: 2026-03-27T12:00:00Z
  checked: Elapsed time
  found: ~1 hour 3 minutes running — likely stuck/hung from previous session
- timestamp: 2026-03-27T12:00:00Z
  checked: ss -tlnp | grep 1420
  found: Only PID 191671 holding port 1420

## Eliminated
- hypothesis: Multiple services competing for port
  evidence: Only one process (191671) on port 1420

## Resolution
root_cause: A previous `npm run dev` session (PID 191644) spawned a Vite dev server (PID 191671) that didn't shut down cleanly. The Vite process continued listening on port 1420, blocking new dev server launches.
fix: Kill the stale process tree (PIDs 191671 and 191644)
verification: Port 1420 freed after kill
files_changed: []
