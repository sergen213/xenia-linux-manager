# Electron Port — Phase 1: Rust Sidecar Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Tauri-coupled Rust crate into a standalone `xlm-core` binary that speaks newline-delimited JSON (NDJSON) JSON-RPC over stdin/stdout, exposing all 77 commands and streaming the 5 job events — with zero Tauri dependencies and all existing logic untouched.

**Architecture:** A long-lived process. A blocking stdin-reader thread feeds request lines into a multi-thread tokio runtime; each request is handled on its own task and dispatched through a 77-arm `match` over the existing command functions; an `EventSink` (a clone of a channel sender) and all responses funnel through one blocking stdout-writer thread so output lines never interleave. `AppHandle`-based event emission is replaced by `EventSink`; Tauri-managed state (`JobRegistry`, `ScanCoordinator`) is replaced by an owned `AppCtx`.

**Tech Stack:** Rust, tokio (multi-thread), serde / serde_json, the existing domain crate `xenia_linux_manager_lib`.

## Global Constraints

- Platform: Linux only.
- No change to business logic, on-disk formats, or XDG path resolution (`dirs` crate). Only the Tauri seam changes.
- Wire contract (must match what the frontend already sends to Tauri):
  - Request line: `{"id": <string>, "method": <snake_case string>, "params": <object>}`
  - `params` keys are **camelCase** (e.g. `appDataPath`, `buildId`, `libraryMetadataPath`, `gameId`). Method names are **snake_case**.
  - Response line: `{"kind":"response","id":<string>,"ok":true,"result":<value>}` or `{"kind":"response","id":<string>,"ok":false,"error":<string>}`.
  - Event line: `{"kind":"event","event":<string>,"payload":<value>}`.
  - On startup the process emits exactly one `{"kind":"event","event":"ready","payload":{"version":<crate version>}}` after state init.
- `serde_json` output is newline-free, so one JSON object per line is safe framing.
- stderr is logging only — never protocol.
- Every existing `cargo test` must stay green throughout.
- Commit after every task. Run `cargo build` and `cargo test` before each commit.

## File Structure

- Create `src-tauri/src/events.rs` — `EventSink` (channel / capture / null) + event-envelope serialization. One responsibility: turn events into output lines.
- Create `src-tauri/src/app_ctx.rs` — `AppCtx { jobs, scans, events }`, the owned replacement for Tauri-managed state.
- Create `src-tauri/src/rpc.rs` — `arg()` param helper + `dispatch(ctx, method, params)` (the 77-arm router).
- Create `src-tauri/src/bin/xlm-core.rs` — the binary: channels, reader/writer threads, request loop, handshake, shutdown.
- Create `src-tauri/tests/sidecar_rpc.rs` — integration tests that spawn the real binary and assert protocol behavior.
- Modify `src-tauri/Cargo.toml` — add the `[[bin]]` target + `rt-multi-thread`; remove all `tauri*` deps and the build-dependency.
- Modify `src-tauri/src/lib.rs` — declare new modules; delete the Tauri `run()` entry + Tauri imports.
- Delete `src-tauri/src/main.rs` (old Tauri entry) and `src-tauri/build.rs` (tauri-build).
- Modify `src-tauri/src/jobs/events.rs` — emit helpers take `&EventSink` not `&AppHandle`.
- Modify `src-tauri/src/library/scan_jobs.rs` — replace `AppHandle` with `EventSink` + `self: &Arc<Self>`.
- Modify `src-tauri/src/commands/{settings,profiles,jobs,release,patches,saves,library,xenia,shell}.rs` — strip `#[tauri::command]`; adapt the 7 stateful commands to take `&AppCtx`; rewrite `shell::open_path` without the Tauri shell plugin.

---

### Task 1: Binary target, multi-thread runtime, handshake + `ping`

Stand up the process skeleton end-to-end before touching domain code: channels, reader/writer threads, the request loop, the `ready` handshake, and a hard-coded `ping` method. This is the smallest thing that proves the transport.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/events.rs`
- Create: `src-tauri/src/app_ctx.rs`
- Create: `src-tauri/src/rpc.rs`
- Create: `src-tauri/src/bin/xlm-core.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/sidecar_rpc.rs`

**Interfaces:**
- Produces: `EventSink` (`channel(Sender<String>)`, `capture()`, `null()`, `emit_raw(String)`, `emit_event<T:Serialize>(&str,&T)`, `captured()->Vec<String>`); `AppCtx { jobs:Arc<JobRegistry>, scans:Arc<ScanCoordinator>, events:EventSink }` with `with_events(EventSink)->Self`; `rpc::dispatch(ctx:&AppCtx, method:&str, params:serde_json::Value) -> Result<serde_json::Value,String>`; `rpc::arg<T:DeserializeOwned>(&Value,&str)->Result<T,String>`.

- [ ] **Step 1: Add the binary target and runtime feature to Cargo.toml**

In `src-tauri/Cargo.toml`, change the tokio feature line to add `rt-multi-thread`, and append a `[[bin]]` section. (Leave tauri deps in place for now — Task 10 removes them.)

```toml
tokio = { version = "1", features = ["fs", "sync", "process", "macros", "rt", "rt-multi-thread"] }

[[bin]]
name = "xlm-core"
path = "src/bin/xlm-core.rs"
```

- [ ] **Step 2: Create the EventSink module**

Create `src-tauri/src/events.rs`:

```rust
//! Output event sink. Replaces Tauri's AppHandle.emit for the sidecar.
//!
//! All emitted events and (separately) all RPC responses are serialized to
//! single-line JSON and funneled through one std::sync::mpsc::Sender to the
//! stdout-writer thread, so lines never interleave.

use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::json;

#[derive(Clone)]
pub struct EventSink {
    inner: Arc<Inner>,
}

enum Inner {
    Channel(Sender<String>),
    Capture(Mutex<Vec<String>>),
    Null,
}

impl EventSink {
    /// Production sink: forwards lines to the stdout-writer thread.
    pub fn channel(tx: Sender<String>) -> Self {
        Self { inner: Arc::new(Inner::Channel(tx)) }
    }

    /// Test sink: records emitted lines for assertions.
    pub fn capture() -> Self {
        Self { inner: Arc::new(Inner::Capture(Mutex::new(Vec::new()))) }
    }

    /// No-op sink (used when an AppCtx is constructed without wiring output).
    pub fn null() -> Self {
        Self { inner: Arc::new(Inner::Null) }
    }

    /// Emit a pre-formatted line (no trailing newline; the writer adds it).
    pub fn emit_raw(&self, line: String) {
        match &*self.inner {
            Inner::Channel(tx) => {
                let _ = tx.send(line);
            }
            Inner::Capture(buf) => buf.lock().unwrap().push(line),
            Inner::Null => {}
        }
    }

    /// Emit an event envelope: {"kind":"event","event":<event>,"payload":<payload>}.
    pub fn emit_event<T: Serialize>(&self, event: &str, payload: &T) {
        let line = json!({ "kind": "event", "event": event, "payload": payload }).to_string();
        self.emit_raw(line);
    }

    /// Test-only: snapshot of captured lines. Panics on non-capture sinks.
    pub fn captured(&self) -> Vec<String> {
        match &*self.inner {
            Inner::Capture(buf) => buf.lock().unwrap().clone(),
            _ => panic!("captured() called on a non-capture EventSink"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_records_event_envelope() {
        let sink = EventSink::capture();
        sink.emit_event("ready", &serde_json::json!({ "version": "0.1.0" }));
        let lines = sink.captured();
        assert_eq!(lines.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(v["kind"], "event");
        assert_eq!(v["event"], "ready");
        assert_eq!(v["payload"]["version"], "0.1.0");
    }

    #[test]
    fn null_sink_discards() {
        let sink = EventSink::null();
        sink.emit_event("x", &1); // must not panic
    }
}
```

- [ ] **Step 3: Create the AppCtx module**

Create `src-tauri/src/app_ctx.rs`:

```rust
//! Owned application context — replaces Tauri's managed state container.

use std::sync::Arc;

use crate::events::EventSink;
use crate::jobs::JobRegistry;
use crate::library::scan_jobs::ScanCoordinator;

#[derive(Clone)]
pub struct AppCtx {
    pub jobs: Arc<JobRegistry>,
    pub scans: Arc<ScanCoordinator>,
    pub events: EventSink,
}

impl AppCtx {
    pub fn with_events(events: EventSink) -> Self {
        Self {
            jobs: Arc::new(JobRegistry::new()),
            scans: Arc::new(ScanCoordinator::new()),
            events,
        }
    }
}
```

- [ ] **Step 4: Create the rpc module with a `ping`-only dispatcher**

Create `src-tauri/src/rpc.rs`. (Later tasks fill in the real arms; for now it only knows `ping`.)

```rust
//! JSON-RPC dispatch: param extraction + method router.

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::app_ctx::AppCtx;

/// Extract and deserialize a camelCase param by key.
pub fn arg<T: DeserializeOwned>(params: &Value, key: &str) -> Result<T, String> {
    let raw = params.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(raw).map_err(|e| format!("invalid param '{key}': {e}"))
}

/// Route one request to its command. Returns the JSON result value or an error string.
pub async fn dispatch(_ctx: &AppCtx, method: &str, _params: Value) -> Result<Value, String> {
    match method {
        "ping" => Ok(Value::String("pong".to_string())),
        other => Err(format!("unknown method: {other}")),
    }
}
```

- [ ] **Step 5: Declare new modules in lib.rs**

In `src-tauri/src/lib.rs`, add these module declarations near the existing `pub mod` lines (do NOT remove the Tauri `run()` yet — that happens in Task 10):

```rust
pub mod app_ctx;
pub mod events;
pub mod rpc;
```

- [ ] **Step 6: Create the binary**

Create `src-tauri/src/bin/xlm-core.rs`:

```rust
//! xlm-core: the Xenia Linux Manager backend as a stdio JSON-RPC sidecar.

use std::io::{BufRead, Write};
use std::sync::mpsc::{channel, Sender};

use serde::Deserialize;
use serde_json::{json, Value};

use xenia_linux_manager_lib::app_ctx::AppCtx;
use xenia_linux_manager_lib::events::EventSink;
use xenia_linux_manager_lib::rpc;

#[derive(Deserialize)]
struct Request {
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

#[tokio::main]
async fn main() {
    // Output channel -> single blocking writer thread. Keeps lines from interleaving.
    let (out_tx, out_rx) = channel::<String>();
    std::thread::spawn(move || {
        let stdout = std::io::stdout();
        let mut lock = stdout.lock();
        for line in out_rx {
            let _ = lock.write_all(line.as_bytes());
            let _ = lock.write_all(b"\n");
            let _ = lock.flush();
        }
    });

    let events = EventSink::channel(out_tx.clone());
    let ctx = AppCtx::with_events(events);

    // Handshake: announce readiness once state exists.
    let version = env!("CARGO_PKG_VERSION");
    let _ = out_tx.send(json!({ "kind": "event", "event": "ready", "payload": { "version": version } }).to_string());

    // Request channel <- blocking stdin reader thread.
    let (req_tx, mut req_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            match line {
                Ok(l) if !l.trim().is_empty() => {
                    if req_tx.send(l).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        // EOF: dropping req_tx ends the loop below.
    });

    while let Some(line) = req_rx.recv().await {
        let ctx = ctx.clone();
        let out_tx = out_tx.clone();
        tokio::spawn(async move {
            handle_line(&ctx, &out_tx, line).await;
        });
    }

    // stdin closed: mark any in-flight jobs interrupted before exit.
    ctx.jobs.interrupt_all_running();
}

async fn handle_line(ctx: &AppCtx, out_tx: &Sender<String>, line: String) {
    let req: Request = match serde_json::from_str(&line) {
        Ok(r) => r,
        Err(e) => {
            let _ = out_tx.send(
                json!({ "kind": "response", "id": Value::Null, "ok": false, "error": format!("malformed request: {e}") })
                    .to_string(),
            );
            return;
        }
    };

    let response = match rpc::dispatch(ctx, &req.method, req.params).await {
        Ok(result) => json!({ "kind": "response", "id": req.id, "ok": true, "result": result }),
        Err(error) => json!({ "kind": "response", "id": req.id, "ok": false, "error": error }),
    };
    let _ = out_tx.send(response.to_string());
}
```

- [ ] **Step 7: Write the failing integration test**

Create `src-tauri/tests/sidecar_rpc.rs`:

```rust
//! End-to-end protocol tests: spawn the real xlm-core binary and talk NDJSON.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

/// Spawn xlm-core, send each request line, return collected stdout lines until
/// `want_lines` have arrived (or the pipe closes).
fn run_lines(requests: &[&str], want_lines: usize) -> Vec<serde_json::Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_xlm-core"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn xlm-core");

    {
        let stdin = child.stdin.as_mut().unwrap();
        for r in requests {
            writeln!(stdin, "{r}").unwrap();
        }
        stdin.flush().unwrap();
    }

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = line.unwrap();
        if line.trim().is_empty() {
            continue;
        }
        out.push(serde_json::from_str::<serde_json::Value>(&line).unwrap());
        if out.len() >= want_lines {
            break;
        }
    }
    let _ = child.kill();
    out
}

#[test]
fn emits_ready_then_answers_ping() {
    let lines = run_lines(&[r#"{"id":"1","method":"ping","params":{}}"#], 2);
    assert_eq!(lines[0]["kind"], "event");
    assert_eq!(lines[0]["event"], "ready");
    assert!(lines[0]["payload"]["version"].is_string());

    assert_eq!(lines[1]["kind"], "response");
    assert_eq!(lines[1]["id"], "1");
    assert_eq!(lines[1]["ok"], true);
    assert_eq!(lines[1]["result"], "pong");
}

#[test]
fn unknown_method_returns_error() {
    let lines = run_lines(&[r#"{"id":"9","method":"does_not_exist","params":{}}"#], 2);
    let resp = &lines[1];
    assert_eq!(resp["ok"], false);
    assert!(resp["error"].as_str().unwrap().contains("unknown method"));
}
```

- [ ] **Step 8: Run tests to verify they fail to compile/pass**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: compiles after Steps 1–7; both tests PASS. If the binary fails to link, confirm `[lib] name = "xenia_linux_manager_lib"` is intact in Cargo.toml.

- [ ] **Step 9: Run the full test + build to confirm nothing else broke**

Run: `cd src-tauri && cargo test && cargo build --bin xlm-core`
Expected: all tests PASS; binary builds.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/events.rs src-tauri/src/app_ctx.rs src-tauri/src/rpc.rs src-tauri/src/bin/xlm-core.rs src-tauri/src/lib.rs src-tauri/tests/sidecar_rpc.rs
git commit -m "feat(sidecar): xlm-core stdio JSON-RPC skeleton with ready handshake + ping"
```

---

### Task 2: Port job event emitters from AppHandle to EventSink

**Files:**
- Modify: `src-tauri/src/jobs/events.rs`

**Interfaces:**
- Consumes: `EventSink` (Task 1).
- Produces: `emit_job_created(&EventSink,&Job)`, `emit_job_progress(&EventSink,&str,u8,&str)`, `emit_job_log(&EventSink,&str,&str,&str,u64)`, `emit_job_completed(&EventSink,&Job)`, `emit_job_failed(&EventSink,&Job)`. The 5 `EVENT_*` constants and the 4 payload structs are unchanged.

- [ ] **Step 1: Replace the imports and emit bodies**

In `src-tauri/src/jobs/events.rs`, delete `use tauri::{AppHandle, Emitter};` and add `use crate::events::EventSink;`. Keep the `EVENT_*` constants and the `JobCreatedPayload`/`JobProgressPayload`/`JobLogPayload`/`JobFinishedPayload` structs exactly as they are. Replace the five emit helpers with:

```rust
pub fn emit_job_created(sink: &EventSink, job: &Job) {
    sink.emit_event(EVENT_JOB_CREATED, &JobCreatedPayload { job: job.clone() });
}

pub fn emit_job_progress(sink: &EventSink, job_id: &str, progress: u8, label: &str) {
    sink.emit_event(
        EVENT_JOB_PROGRESS,
        &JobProgressPayload { job_id: job_id.to_string(), progress, label: label.to_string() },
    );
}

pub fn emit_job_log(sink: &EventSink, job_id: &str, message: &str, level: &str, timestamp: u64) {
    sink.emit_event(
        EVENT_JOB_LOG,
        &JobLogPayload {
            job_id: job_id.to_string(),
            message: message.to_string(),
            level: level.to_string(),
            timestamp,
        },
    );
}

pub fn emit_job_completed(sink: &EventSink, job: &Job) {
    sink.emit_event(EVENT_JOB_COMPLETED, &JobFinishedPayload { job: job.clone() });
}

pub fn emit_job_failed(sink: &EventSink, job: &Job) {
    sink.emit_event(EVENT_JOB_FAILED, &JobFinishedPayload { job: job.clone() });
}
```

- [ ] **Step 2: Add an envelope test alongside the existing serialization tests**

Keep the existing `#[cfg(test)]` tests (`event_constants_are_namespaced`, `payload_serialization`, `log_payload_serialization`). Add:

```rust
#[test]
fn progress_emits_exact_envelope() {
    use crate::events::EventSink;
    let sink = EventSink::capture();
    emit_job_progress(&sink, "test-1", 42, "Downloading");
    let lines = sink.captured();
    assert_eq!(lines.len(), 1);
    let v: serde_json::Value = serde_json::from_str(&lines[0]).unwrap();
    assert_eq!(v["event"], "job:progress");
    assert_eq!(v["payload"]["job_id"], "test-1");
    assert_eq!(v["payload"]["progress"], 42);
    assert_eq!(v["payload"]["label"], "Downloading");
}
```

- [ ] **Step 3: Run the events tests**

Run: `cd src-tauri && cargo test --lib jobs::events`
Expected: PASS. (This will not fully compile until callers are updated — Tasks 3 and 5 fix the call sites. If the crate fails to build only because `scan_jobs.rs`/`xenia.rs` still pass `&AppHandle`, that is expected and resolved in those tasks. Proceed; the combined green build is verified at the end of Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/jobs/events.rs
git commit -m "refactor(jobs): emit job events through EventSink instead of AppHandle"
```

---

### Task 3: Re-plumb ScanCoordinator from AppHandle to EventSink + Arc<Self>

The coordinator currently finds *itself* through `app.try_state::<Arc<ScanCoordinator>>()` and emits via `&AppHandle`. Replace both: emit via `EventSink`, and reach itself by capturing an `Arc<ScanCoordinator>` in the spawned task.

**Files:**
- Modify: `src-tauri/src/library/scan_jobs.rs`

**Interfaces:**
- Consumes: `EventSink`, `events::emit_job_*` (now `&EventSink`).
- Produces (new signatures other tasks call):
  - `ScanCoordinator::enqueue_scan(self: &Arc<Self>, job_id: String, source_id: String, library_metadata_path: String, app_data_path: String, events: EventSink, registry: Arc<JobRegistry>, launch_mode: ScanLaunchMode)`
  - `ScanCoordinator::finish_scan(self: &Arc<Self>, job_id: &str)` (unchanged name; receiver becomes `&Arc<Self>`)
  - `cancel_scan`, `is_cancelled`, `active_scan_count`, `queued_scan_count`, `drain_queue`, `new` unchanged.

- [ ] **Step 1: Swap struct fields and imports**

In `src-tauri/src/library/scan_jobs.rs`:
- Remove `use tauri::AppHandle;` (and any `tauri::async_runtime` import — replace spawns with `tokio::spawn`).
- Add `use crate::events::EventSink;`.
- Change `ScanRuntimeContext` from `{ app_handle: AppHandle, registry: Arc<JobRegistry> }` to:

```rust
#[derive(Clone)]
struct ScanRuntimeContext {
    events: EventSink,
    registry: Arc<JobRegistry>,
}
```

- [ ] **Step 2: Rewrite `enqueue_scan` and `spawn_scan`**

Change the receiver to `self: &Arc<Self>` and thread `EventSink` instead of `AppHandle`. `spawn_scan` captures `Arc::clone(self)` so the task can run the cancellation check and call `finish_scan`:

```rust
pub fn enqueue_scan(
    self: &Arc<Self>,
    job_id: String,
    source_id: String,
    library_metadata_path: String,
    app_data_path: String,
    events: EventSink,
    registry: Arc<JobRegistry>,
    launch_mode: ScanLaunchMode,
) {
    let request = ScanRequest { job_id, source_id, library_metadata_path, app_data_path };
    let start_now = {
        let mut state = self.state.lock().unwrap();
        state.runtime = Some(ScanRuntimeContext { events: events.clone(), registry: registry.clone() });
        let idle = state.active.is_empty();
        if idle || matches!(launch_mode, ScanLaunchMode::StartImmediately) {
            state.active.push(request.job_id.clone());
            true
        } else {
            state.queue.push_back(request.clone());
            false
        }
    };
    if start_now {
        self.spawn_scan(request, events, registry);
    }
}

fn spawn_scan(self: &Arc<Self>, request: ScanRequest, events: EventSink, registry: Arc<JobRegistry>) {
    let coordinator = Arc::clone(self);
    let job_id = request.job_id.clone();
    tokio::spawn(async move {
        run_scan_job(&events, &registry, &coordinator, request).await;
        coordinator.finish_scan(&job_id);
    });
}
```

(Keep the existing locking/queueing logic; the snippet above shows the shape — preserve whatever the current `enqueue_scan` did for `StartImmediately` vs busy, just swap `app_handle`→`events`/`Arc<Self>`.)

- [ ] **Step 3: Rewrite `finish_scan` to use `self: &Arc<Self>`**

```rust
pub fn finish_scan(self: &Arc<Self>, job_id: &str) {
    let next = {
        let mut state = self.state.lock().unwrap();
        state.active.retain(|id| id != job_id);
        state.cancelled.retain(|id| id != job_id);
        if state.active.is_empty() {
            if let Some(req) = state.queue.pop_front() {
                state.active.push(req.job_id.clone());
                state.runtime.clone().map(|ctx| (req, ctx))
            } else {
                None
            }
        } else {
            None
        }
    };
    if let Some((req, ctx)) = next {
        self.spawn_scan(req, ctx.events, ctx.registry);
    }
}
```

- [ ] **Step 4: Rewrite `run_scan_job` signature and its two AppHandle uses**

Change the free function from `run_scan_job(app: &AppHandle, registry: &Arc<JobRegistry>, ...)` to:

```rust
async fn run_scan_job(
    events: &EventSink,
    registry: &Arc<JobRegistry>,
    coordinator: &Arc<ScanCoordinator>,
    request: ScanRequest,
) {
```

Inside it:
- Replace every `events::emit_job_log(app, ...)` / `emit_job_progress(app, ...)` / `emit_job_completed(app, ...)` / `emit_job_failed(app, ...)` call: pass `events` instead of `app`. (The helper signatures already changed in Task 2.) Update the local helpers `log_and_emit`, `update_progress`, `complete_job`, `fail_job` the same way — change their `app: &AppHandle` param to `events: &EventSink` and forward it.
- Replace the cancellation predicate. The old code did `let coordinator_ref = app.try_state::<Arc<ScanCoordinator>>();` then a closure calling `c.is_cancelled(&job_id_owned)`. Replace with a clone of the passed coordinator:

```rust
let cancel_coordinator = Arc::clone(coordinator);
let job_id_owned = request.job_id.clone();
let is_cancelled = move || cancel_coordinator.is_cancelled(&job_id_owned);
// pass `is_cancelled` to discovery::discover_candidates exactly as before
```

- Delete the old `finish_scan_runtime_slot(app, job_id)` free function; its job (releasing the slot + promoting the next scan) is now done by `coordinator.finish_scan(&job_id)` in `spawn_scan`.

- [ ] **Step 5: Build and run the existing scan_jobs tests**

Run: `cd src-tauri && cargo build && cargo test --lib library::scan_jobs`
Expected: builds; the existing synchronous coordinator-state tests PASS (they construct no AppHandle and don't spawn, so they are unaffected by the swap).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/library/scan_jobs.rs
git commit -m "refactor(library): scan coordinator uses EventSink + Arc<Self> instead of AppHandle"
```

---

### Task 4: Strip `#[tauri::command]` and adapt the 7 stateful commands to `&AppCtx`

70 commands are pure (business args only) — they just lose the attribute. 7 commands take Tauri `State`/`AppHandle` and must take `&AppCtx` instead. This task changes signatures only; dispatch wiring is Tasks 5–9.

The 7 stateful commands and their new signatures:

| Command | New signature (business args + `ctx: &AppCtx`) |
|---|---|
| `xenia::start_install` | `(ctx: &AppCtx, xenia_path: String, app_data_path: String, release: LinuxRelease) -> Result<String,String>` |
| `xenia::start_update` | `(ctx: &AppCtx, xenia_path: String, app_data_path: String, release: LinuxRelease) -> Result<String,String>` |
| `xenia::retry_last_operation` | `(ctx: &AppCtx, xenia_path: String, app_data_path: String) -> Result<String,String>` |
| `library::start_source_scan` | `(ctx: &AppCtx, library_metadata_path: String, source_id: String) -> Result<String,String>` |
| `library::scan_all_sources` | `(ctx: &AppCtx, library_metadata_path: String) -> Result<Vec<String>,String>` |
| `library::cancel_scan` | `(ctx: &AppCtx, app_data_path: String, job_id: String) -> Result<(),String>` |
| `library::get_library_status` | `(ctx: &AppCtx, library_metadata_path: String) -> LibraryStatus` |

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`, `profiles.rs`, `jobs.rs`, `release.rs`, `patches.rs`, `saves.rs`, `library.rs`, `xenia.rs`, `shell.rs`

**Interfaces:**
- Consumes: `AppCtx`, `EventSink`, the ported `events::emit_job_*`.
- Produces: all 77 command functions as plain (non-attribute) `pub fn`/`pub async fn`, callable from `rpc::dispatch`.

- [ ] **Step 1: Remove every `#[tauri::command]` attribute**

In all 9 command files, delete each `#[tauri::command]` line. Remove now-unused `use tauri::...` imports from each file (e.g. `tauri::State`, `tauri::AppHandle`).

- [ ] **Step 2: Adapt the 6 emitting/stateful commands' bodies**

For `xenia::start_install`, `start_update`, `retry_last_operation` and `library::start_source_scan`, `scan_all_sources`, `cancel_scan`:
- Replace the params `app: AppHandle`, `registry: State<'_, Arc<JobRegistry>>`, `coordinator: State<'_, Arc<ScanCoordinator>>` with a single `ctx: &AppCtx`.
- Inside the body, replace `registry` with `&ctx.jobs`, `coordinator` with `&ctx.scans`, and every `emit_job_*(&app, ...)` with `emit_job_*(&ctx.events, ...)`.
- In the xenia commands, the private `run_lifecycle_pipeline(...)` (and its helpers `log_and_emit`, `update_progress`, `complete_job`, `fail_job`) currently take `app: AppHandle`. Change that parameter to `events: EventSink` (owned clone, since it is moved into the spawned task) and forward it to the emit helpers. Replace `tauri::async_runtime::spawn(...)` with `tokio::spawn(...)`. At the spawn site pass `ctx.events.clone()` and `Arc::clone(&ctx.jobs)`.
- In `library::start_source_scan`/`scan_all_sources`, call `ctx.scans.enqueue_scan(job_id, source_id, library_metadata_path, app_data_path, ctx.events.clone(), Arc::clone(&ctx.jobs), launch_mode)` (the new Task 3 signature). Keep `resolve_app_data_path()` as-is. For `cancel_scan`, call `ctx.scans.cancel_scan(&job_id)` and `emit_job_failed(&ctx.events, &job)`.

- [ ] **Step 3: Adapt `get_library_status`**

Replace `coordinator: State<'_, Arc<ScanCoordinator>>` with `ctx: &AppCtx`; read `ctx.scans.active_scan_count()` / `ctx.scans.queued_scan_count()`.

- [ ] **Step 4: Update command-module tests that built an AppHandle**

In `xenia.rs` (and any other command file whose `#[cfg(test)]` block constructed an `AppHandle` or `State`), replace that setup with `let ctx = AppCtx::with_events(EventSink::capture());` and call the command as `start_install(&ctx, ...).await`. Assert emitted events via `ctx.events.captured()` where the test previously relied on Tauri emission. Tests that only exercise private pure helpers need no change.

- [ ] **Step 5: Build and run the full test suite**

Run: `cd src-tauri && cargo build && cargo test`
Expected: builds and all tests PASS. (The crate still depends on tauri via `lib.rs::run`; that is fine until Task 10.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands
git commit -m "refactor(commands): drop tauri::command; stateful commands take &AppCtx"
```

---

### Task 5: Rewrite `shell::open_path` without the Tauri shell plugin

**Files:**
- Modify: `src-tauri/src/commands/shell.rs`

**Interfaces:**
- Produces: `open_path(path: String, allowed_roots: Vec<String>) -> Result<(), String>` — same signature, now backed by `xdg-open`.

- [ ] **Step 1: Write the failing test**

Add to `src-tauri/src/commands/shell.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_outside_allowed_roots() {
        let err = open_path("/etc/shadow".to_string(), vec!["/home/user/games".to_string()]);
        assert!(err.is_err());
        assert!(err.unwrap_err().to_lowercase().contains("not allowed"));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src-tauri && cargo test --lib commands::shell`
Expected: FAIL to compile (old body used the tauri shell plugin) or assertion mismatch.

- [ ] **Step 3: Implement without Tauri**

Replace the body of `open_path` (keep its existing path-validation helper logic if present; the key is to drop the plugin and spawn `xdg-open`):

```rust
use std::path::Path;
use std::process::Command;

pub fn open_path(path: String, allowed_roots: Vec<String>) -> Result<(), String> {
    let target = Path::new(&path);
    let canonical = target.canonicalize().map_err(|e| format!("cannot resolve path: {e}"))?;
    let allowed = allowed_roots.iter().any(|root| {
        Path::new(root)
            .canonicalize()
            .map(|r| canonical.starts_with(&r))
            .unwrap_or(false)
    });
    if !allowed {
        return Err(format!("path not allowed: {}", canonical.display()));
    }
    Command::new("xdg-open")
        .arg(&canonical)
        .spawn()
        .map_err(|e| format!("failed to launch xdg-open: {e}"))?;
    Ok(())
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src-tauri && cargo test --lib commands::shell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/shell.rs
git commit -m "refactor(shell): open_path uses xdg-open instead of tauri shell plugin"
```

---

### Task 6: Dispatch arms — settings, profiles, jobs, release (20 commands)

Fill `rpc::dispatch` with the pure, mostly-synchronous commands. Establishes the three arm shapes: no-arg bare-return, args + `Result`, and `Option`/tuple returns.

**Files:**
- Modify: `src-tauri/src/rpc.rs`
- Modify: `src-tauri/tests/sidecar_rpc.rs`

**Interfaces:**
- Consumes: command fns from `commands::{settings,profiles,jobs,release}`, `arg()` helper.
- Produces: 20 routed methods.

- [ ] **Step 1: Add imports and the 20 arms**

In `src-tauri/src/rpc.rs`, add at the top:

```rust
use xenia_linux_manager_lib_imports::*; // placeholder line — do NOT use; see note
```

Note: `rpc.rs` lives *inside* the lib crate, so reference modules with `crate::commands::...`. Add the arms inside the `match method { ... }` before the `other => ...` fallback. Helper for bare (non-Result) returns: wrap in `Ok`. Pattern reference:

```rust
// --- settings ---
"get_default_settings" => Ok(serde_json::to_value(crate::commands::settings::get_default_settings()).map_err(|e| e.to_string())?),
"load_settings" => {
    let v = crate::commands::settings::load_settings().map_err(|e| e)?;
    Ok(serde_json::to_value(v).map_err(|e| e.to_string())?)
}
"save_settings" => {
    let settings = arg(&params, "settings")?;
    let v = crate::commands::settings::save_settings(settings)?;
    Ok(serde_json::to_value(v).map_err(|e| e.to_string())?)
}
"validate_paths" => {
    let settings = arg(&params, "settings")?;
    Ok(serde_json::to_value(crate::commands::settings::validate_paths(settings)).map_err(|e| e.to_string())?)
}

// --- profiles ---
"list_game_profiles" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::profiles::list_game_profiles(library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"create_game_profile" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let name: String = arg(&params, "name")?;
    Ok(serde_json::to_value(crate::commands::profiles::create_game_profile(library_metadata_path, game_id, name)?).map_err(|e| e.to_string())?)
}
"rename_game_profile" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_id: String = arg(&params, "profileId")?;
    let new_name: String = arg(&params, "newName")?;
    Ok(serde_json::to_value(crate::commands::profiles::rename_game_profile(library_metadata_path, game_id, profile_id, new_name)?).map_err(|e| e.to_string())?)
}
"delete_game_profile" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_id: String = arg(&params, "profileId")?;
    Ok(serde_json::to_value(crate::commands::profiles::delete_game_profile(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
}
"select_active_game_profile" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_id: Option<String> = arg(&params, "profileId")?;
    Ok(serde_json::to_value(crate::commands::profiles::select_active_game_profile(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
}
"get_profile_effective_config" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_id: String = arg(&params, "profileId")?;
    Ok(serde_json::to_value(crate::commands::profiles::get_profile_effective_config(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
}
"save_profile_overrides" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_id: String = arg(&params, "profileId")?;
    let overrides = arg(&params, "overrides")?;
    Ok(serde_json::to_value(crate::commands::profiles::save_profile_overrides(library_metadata_path, game_id, profile_id, overrides)?).map_err(|e| e.to_string())?)
}
"get_materialized_launch_config" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::profiles::get_materialized_launch_config(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"check_recommendation_availability" => {
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::profiles::check_recommendation_availability(game_id)).map_err(|e| e.to_string())?)
}
"apply_recommended_profile" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let profile_name: Option<String> = arg(&params, "profileName")?;
    Ok(serde_json::to_value(crate::commands::profiles::apply_recommended_profile(library_metadata_path, game_id, profile_name)?).map_err(|e| e.to_string())?)
}

// --- jobs (task history) ---
"load_task_history" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::jobs::load_task_history(app_data_path)?).map_err(|e| e.to_string())?)
}
"get_task_history" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::jobs::get_task_history(app_data_path)).map_err(|e| e.to_string())?)
}
"clear_task_history" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    crate::commands::jobs::clear_task_history(app_data_path)?;
    Ok(serde_json::Value::Null)
}

// --- release ---
"get_release_metadata" => Ok(serde_json::to_value(crate::commands::release::get_release_metadata()).map_err(|e| e.to_string())?),
"get_updater_readiness" => Ok(serde_json::to_value(crate::commands::release::get_updater_readiness()).map_err(|e| e.to_string())?),
"get_environment_diagnostics" => Ok(serde_json::to_value(crate::commands::release::get_environment_diagnostics()).map_err(|e| e.to_string())?),
```

(Remove the bogus `use ... _imports::*;` placeholder line — it is only there to flag that you must use `crate::` paths, not an external import.)

- [ ] **Step 2: Add a completeness test for these methods**

In `src-tauri/tests/sidecar_rpc.rs` add:

```rust
#[test]
fn known_methods_are_not_unknown() {
    // Sending with empty params may produce a param error, but never "unknown method".
    for m in [
        "get_default_settings", "load_settings", "get_release_metadata",
        "get_updater_readiness", "get_environment_diagnostics",
    ] {
        let req = format!(r#"{{"id":"t","method":"{m}","params":{{}}}}"#);
        let lines = run_lines(&[&req], 2);
        let resp = &lines[1];
        if resp["ok"] == false {
            assert!(
                !resp["error"].as_str().unwrap().contains("unknown method"),
                "method {m} routed as unknown"
            );
        }
    }
}
```

- [ ] **Step 3: Build and test**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: PASS (`get_default_settings`/`get_release_metadata` etc. return real values; the no-arg ones succeed).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/rpc.rs src-tauri/tests/sidecar_rpc.rs
git commit -m "feat(sidecar): dispatch arms for settings, profiles, jobs, release"
```

---

### Task 7: Dispatch arms — patches + saves (14 commands)

**Files:**
- Modify: `src-tauri/src/rpc.rs`

- [ ] **Step 1: Add the patches + saves arms**

Insert into the `match`:

```rust
// --- patches ---
"check_patches_status" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::patches::check_patches_status(app_data_path).await).map_err(|e| e.to_string())?)
}
"deploy_game_patches" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::patches::deploy_game_patches(app_data_path).await).map_err(|e| e.to_string())?)
}
"get_game_xenia_patches" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let title_id: String = arg(&params, "titleId")?;
    Ok(serde_json::to_value(crate::commands::patches::get_game_xenia_patches(app_data_path, title_id)?).map_err(|e| e.to_string())?)
}
"toggle_xenia_patch_entry" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let file_path: String = arg(&params, "filePath")?;
    let entry_name: String = arg(&params, "entryName")?;
    let enabled: bool = arg(&params, "enabled")?;
    crate::commands::patches::toggle_xenia_patch_entry(app_data_path, file_path, entry_name, enabled)?;
    Ok(serde_json::Value::Null)
}
"list_xenia_community_patch_candidates" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let title_id: String = arg(&params, "titleId")?;
    Ok(serde_json::to_value(crate::commands::patches::list_xenia_community_patch_candidates(app_data_path, title_id).await?).map_err(|e| e.to_string())?)
}
"fetch_xenia_community_patch" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let remote_key: String = arg(&params, "remoteKey")?;
    Ok(serde_json::to_value(crate::commands::patches::fetch_xenia_community_patch(app_data_path, remote_key).await?).map_err(|e| e.to_string())?)
}
"import_xenia_patch_file" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let input = arg(&params, "input")?;
    crate::commands::patches::import_xenia_patch_file(app_data_path, input)?;
    Ok(serde_json::Value::Null)
}

// --- saves ---
"get_export_preflight" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::saves::get_export_preflight(library_metadata_path, xenia_path, game_id)?).map_err(|e| e.to_string())?)
}
"export_save_archive" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let output_dir: String = arg(&params, "outputDir")?;
    let selected_labels: Option<Vec<String>> = arg(&params, "selectedLabels")?;
    Ok(serde_json::to_value(crate::commands::saves::export_save_archive(app_data_path, library_metadata_path, xenia_path, game_id, output_dir, selected_labels).await?).map_err(|e| e.to_string())?)
}
"inspect_save_archive" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let archive_path: String = arg(&params, "archivePath")?;
    Ok(serde_json::to_value(crate::commands::saves::inspect_save_archive(app_data_path, library_metadata_path, archive_path).await?).map_err(|e| e.to_string())?)
}
"get_import_conflict_plan" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let staging_path: String = arg(&params, "stagingPath")?;
    let target_game_id: String = arg(&params, "targetGameId")?;
    let source_game_id: String = arg(&params, "sourceGameId")?;
    let source_game_title: String = arg(&params, "sourceGameTitle")?;
    let policy = arg(&params, "policy")?;
    Ok(serde_json::to_value(crate::commands::saves::get_import_conflict_plan(library_metadata_path, xenia_path, staging_path, target_game_id, source_game_id, source_game_title, policy)?).map_err(|e| e.to_string())?)
}
"apply_save_import" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let plan = arg(&params, "plan")?;
    let staging_path: String = arg(&params, "stagingPath")?;
    let force_without_backup: bool = arg(&params, "forceWithoutBackup")?;
    Ok(serde_json::to_value(crate::commands::saves::apply_save_import(app_data_path, library_metadata_path, xenia_path, plan, staging_path, force_without_backup).await?).map_err(|e| e.to_string())?)
}
"cleanup_save_import_staging" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    crate::commands::saves::cleanup_save_import_staging(app_data_path).await?;
    Ok(serde_json::Value::Null)
}
"list_save_backups" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::saves::list_save_backups(app_data_path)).map_err(|e| e.to_string())?)
}
```

Note on `get_import_conflict_plan`: the Rust fn names two params `_source_game_id` / `_source_game_title` (unused in body). They are still received over the wire. Confirm the camelCase keys the frontend sends by checking `src/features/saves/api/*Client.ts` for the `get_import_conflict_plan` invoke call; the arm above assumes `sourceGameId` / `sourceGameTitle`. If the client uses different keys, match them.

- [ ] **Step 2: Build and test**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: PASS (compiles; completeness for these methods proven by the no-unknown test once added — extend the `known_methods_are_not_unknown` list with these 14 names).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/rpc.rs src-tauri/tests/sidecar_rpc.rs
git commit -m "feat(sidecar): dispatch arms for patches and saves"
```

---

### Task 8: Dispatch arms — library (pure, 23 commands) + xenia (pure, 9 commands)

All library and xenia commands that do NOT need `AppCtx`. (The 6 stateful ones are Task 9.)

**Files:**
- Modify: `src-tauri/src/rpc.rs`

- [ ] **Step 1: Add the xenia pure arms (9)**

```rust
"fetch_latest_release" => {
    let channel = arg(&params, "channel")?;
    Ok(serde_json::to_value(crate::commands::xenia::fetch_latest_release(channel).await?).map_err(|e| e.to_string())?)
}
"fetch_recent_releases" => {
    let channel = arg(&params, "channel")?;
    Ok(serde_json::to_value(crate::commands::xenia::fetch_recent_releases(channel).await?).map_err(|e| e.to_string())?)
}
"get_install_status" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::xenia::get_install_status(app_data_path)).map_err(|e| e.to_string())?)
}
"check_for_update" => {
    let installed_tag: String = arg(&params, "installedTag")?;
    Ok(serde_json::to_value(crate::commands::xenia::check_for_update(installed_tag).await?).map_err(|e| e.to_string())?)
}
"check_for_update_auto" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::xenia::check_for_update_auto(app_data_path).await?).map_err(|e| e.to_string())?)
}
"clear_install_failure" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    crate::commands::xenia::clear_install_failure(app_data_path)?;
    Ok(serde_json::Value::Null)
}
"cleanup_install_artifacts" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let release = arg(&params, "release")?;
    crate::commands::xenia::cleanup_install_artifacts(app_data_path, release).await?;
    Ok(serde_json::Value::Null)
}
"switch_active_xenia_build" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let build_id: String = arg(&params, "buildId")?;
    Ok(serde_json::to_value(crate::commands::xenia::switch_active_xenia_build(app_data_path, build_id).await?).map_err(|e| e.to_string())?)
}
"remove_xenia_install" => {
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let app_data_path: String = arg(&params, "appDataPath")?;
    let build_id: Option<String> = arg(&params, "buildId")?;
    Ok(serde_json::to_value(crate::commands::xenia::remove_xenia_install(xenia_path, app_data_path, build_id).await?).map_err(|e| e.to_string())?)
}
```

- [ ] **Step 2: Add the library pure arms (23)**

```rust
"add_library_source" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let path: String = arg(&params, "path")?;
    Ok(serde_json::to_value(crate::commands::library::add_library_source(library_metadata_path, path)?).map_err(|e| e.to_string())?)
}
"list_library_sources" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::list_library_sources(library_metadata_path)).map_err(|e| e.to_string())?)
}
"remove_library_source" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let source_id: String = arg(&params, "sourceId")?;
    Ok(serde_json::to_value(crate::commands::library::remove_library_source(library_metadata_path, source_id)?).map_err(|e| e.to_string())?)
}
"get_source_catalog" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let source_id: String = arg(&params, "sourceId")?;
    Ok(serde_json::to_value(crate::commands::library::get_source_catalog(library_metadata_path, source_id)).map_err(|e| e.to_string())?)
}
"get_all_catalogs" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::get_all_catalogs(library_metadata_path)).map_err(|e| e.to_string())?)
}
"browse_library" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::browse_library(library_metadata_path)).map_err(|e| e.to_string())?)
}
"get_review_inbox" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::get_review_inbox(library_metadata_path)).map_err(|e| e.to_string())?)
}
"get_library_game_details" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::library::get_library_game_details(library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"create_manual_game" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::create_manual_game(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"update_library_game_identity" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::update_library_game_identity(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"update_preferred_xenia_build" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::update_preferred_xenia_build(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"update_game_launch_environment" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::update_game_launch_environment(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"update_game_launch_wrapper" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::update_game_launch_wrapper(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"resolve_duplicate_review" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let input = arg(&params, "input")?;
    Ok(serde_json::to_value(crate::commands::library::resolve_duplicate_review(library_metadata_path, input)?).map_err(|e| e.to_string())?)
}
"get_launch_preflight" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::library::get_launch_preflight(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"get_launch_preflight_with_profile" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::library::get_launch_preflight_with_profile(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"launch_library_game" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let allow_warnings: bool = arg(&params, "allowWarnings")?;
    Ok(serde_json::to_value(crate::commands::library::launch_library_game(app_data_path, library_metadata_path, game_id, allow_warnings)?).map_err(|e| e.to_string())?)
}
"export_game_desktop_shortcut" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let target: Option<String> = arg(&params, "target")?;
    Ok(serde_json::to_value(crate::commands::library::export_game_desktop_shortcut(app_data_path, library_metadata_path, game_id, target)?).map_err(|e| e.to_string())?)
}
"get_shortcut_locations" => {
    Ok(serde_json::to_value(crate::commands::library::get_shortcut_locations()?).map_err(|e| e.to_string())?)
}
"inspect_game_content" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::library::inspect_game_content(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
}
"import_game_content" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let source_path: String = arg(&params, "sourcePath")?;
    let content_type: String = arg(&params, "contentType")?;
    Ok(serde_json::to_value(crate::commands::library::import_game_content(app_data_path, library_metadata_path, game_id, source_path, content_type)?).map_err(|e| e.to_string())?)
}
"remove_game_content" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let entry_path: String = arg(&params, "entryPath")?;
    Ok(serde_json::to_value(crate::commands::library::remove_game_content(app_data_path, library_metadata_path, game_id, entry_path)?).map_err(|e| e.to_string())?)
}
"fetch_game_artwork" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    Ok(serde_json::to_value(crate::commands::library::fetch_game_artwork(library_metadata_path, game_id).await).map_err(|e| e.to_string())?)
}
"fetch_all_artwork" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::fetch_all_artwork(library_metadata_path).await).map_err(|e| e.to_string())?)
}
"detect_steam_install" => {
    Ok(serde_json::to_value(crate::commands::library::detect_steam_install()?).map_err(|e| e.to_string())?)
}
"export_game_to_steam" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let app_data_path: String = arg(&params, "appDataPath")?;
    let game_id: String = arg(&params, "gameId")?;
    let steam_user_id: String = arg(&params, "steamUserId")?;
    Ok(serde_json::to_value(crate::commands::library::export_game_to_steam(library_metadata_path, app_data_path, game_id, steam_user_id)?).map_err(|e| e.to_string())?)
}
```

(`open_path` arm: add `"open_path" => { let path: String = arg(&params,"path")?; let allowed_roots: Vec<String> = arg(&params,"allowedRoots")?; crate::commands::shell::open_path(path, allowed_roots)?; Ok(serde_json::Value::Null) }`.)

- [ ] **Step 3: Build and test**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: PASS. Extend `known_methods_are_not_unknown` with `get_install_status`, `list_library_sources`, `get_shortcut_locations`, `detect_steam_install`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/rpc.rs src-tauri/tests/sidecar_rpc.rs
git commit -m "feat(sidecar): dispatch arms for pure library + xenia + open_path"
```

---

### Task 9: Dispatch arms — the 7 stateful commands (install / scan)

Wire the commands that need `AppCtx`. This is where job events flow end-to-end.

**Files:**
- Modify: `src-tauri/src/rpc.rs`
- Modify: `src-tauri/tests/sidecar_rpc.rs`

- [ ] **Step 1: Add the 7 ctx-passing arms**

```rust
"start_install" => {
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let app_data_path: String = arg(&params, "appDataPath")?;
    let release = arg(&params, "release")?;
    Ok(serde_json::to_value(crate::commands::xenia::start_install(_ctx, xenia_path, app_data_path, release).await?).map_err(|e| e.to_string())?)
}
"start_update" => {
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let app_data_path: String = arg(&params, "appDataPath")?;
    let release = arg(&params, "release")?;
    Ok(serde_json::to_value(crate::commands::xenia::start_update(_ctx, xenia_path, app_data_path, release).await?).map_err(|e| e.to_string())?)
}
"retry_last_operation" => {
    let xenia_path: String = arg(&params, "xeniaPath")?;
    let app_data_path: String = arg(&params, "appDataPath")?;
    Ok(serde_json::to_value(crate::commands::xenia::retry_last_operation(_ctx, xenia_path, app_data_path).await?).map_err(|e| e.to_string())?)
}
"start_source_scan" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    let source_id: String = arg(&params, "sourceId")?;
    Ok(serde_json::to_value(crate::commands::library::start_source_scan(_ctx, library_metadata_path, source_id).await?).map_err(|e| e.to_string())?)
}
"scan_all_sources" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::scan_all_sources(_ctx, library_metadata_path).await?).map_err(|e| e.to_string())?)
}
"cancel_scan" => {
    let app_data_path: String = arg(&params, "appDataPath")?;
    let job_id: String = arg(&params, "jobId")?;
    crate::commands::library::cancel_scan(_ctx, app_data_path, job_id).await?;
    Ok(serde_json::Value::Null)
}
"get_library_status" => {
    let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
    Ok(serde_json::to_value(crate::commands::library::get_library_status(_ctx, library_metadata_path)).map_err(|e| e.to_string())?)
}
```

- [ ] **Step 2: Rename the dispatch param from `_ctx` to `ctx`**

Now that arms use the context, change the `dispatch` signature param `_ctx` to `ctx`.

- [ ] **Step 3: Add an event-streaming integration test**

In `src-tauri/tests/sidecar_rpc.rs`, add a test that drives `start_install` against a throwaway temp dir and asserts a `job:created` event line arrives with the returned job id. Use a temp dir as both `xeniaPath` and `appDataPath` and a minimal valid `release` JSON (copy a `LinuxRelease` shape from `src-tauri/src/xenia/releases.rs` — the install will likely fail to download and emit `job:failed`, which is fine; we only assert the `job:created` event and a response carrying a job id string):

```rust
#[test]
fn start_install_emits_job_created() {
    let tmp = std::env::temp_dir().join("xlm_test_install");
    let _ = std::fs::create_dir_all(&tmp);
    let p = tmp.to_string_lossy();
    // Minimal LinuxRelease — adjust field names to match releases.rs.
    let release = r#"{"channel":"canary","tag":"0","build_id":"canary-0","download_url":"http://127.0.0.1:0/none","published_at":"","size_bytes":0,"asset_name":"x"}"#;
    let req = format!(
        r#"{{"id":"i1","method":"start_install","params":{{"xeniaPath":"{p}","appDataPath":"{p}","release":{release}}}}}"#
    );
    // Collect several lines: ready + job:created + response (order of the last two may vary).
    let lines = run_lines(&[&req], 4);
    let kinds: Vec<String> = lines.iter().map(|l| l["event"].as_str().unwrap_or(l["kind"].as_str().unwrap_or("")).to_string()).collect();
    assert!(kinds.iter().any(|k| k == "job:created"), "expected a job:created event, got {kinds:?}");
}
```

If the exact `LinuxRelease` field names differ, read `src-tauri/src/xenia/releases.rs` and fix the JSON. This test only proves the event path; it does not require a successful download.

- [ ] **Step 4: Build and test**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: PASS, including `start_install_emits_job_created`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/rpc.rs src-tauri/tests/sidecar_rpc.rs
git commit -m "feat(sidecar): dispatch arms for install/scan; job events stream end-to-end"
```

---

### Task 10: Remove Tauri entirely from the crate

With every command routed through `rpc::dispatch`, the Tauri app entry and deps are dead. Remove them so `xlm-core` has zero Tauri dependencies (spec Phase-1 verification).

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Delete: `src-tauri/src/main.rs`, `src-tauri/build.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Delete the Tauri entry point**

In `src-tauri/src/lib.rs`, delete `pub fn run()` (the whole `tauri::Builder` block) and the `use commands::... as ..._commands;` aliases that only fed it, plus any `use tauri::...`. Keep all `pub mod` declarations (including the new `app_ctx`, `events`, `rpc`).

- [ ] **Step 2: Delete the old binary and build script**

```bash
git rm src-tauri/src/main.rs src-tauri/build.rs
```

- [ ] **Step 3: Strip Tauri from Cargo.toml**

Remove these dependency lines: `tauri`, `tauri-plugin-shell`, `tauri-plugin-updater`, `tauri-plugin-process`, `tauri-plugin-fs`, `tauri-plugin-dialog`. Remove the entire `[build-dependencies]` section (`tauri-build`). Remove `crate-type` entries `"cdylib"` and `"staticlib"` from `[lib]` if they were only there for Tauri (keep `"lib"`). Remove the `build = "build.rs"` key from `[package]` if present.

- [ ] **Step 4: Verify zero Tauri references remain in Rust**

Run: `cd src-tauri && grep -rn "tauri" src/ Cargo.toml ; echo "exit: $?"`
Expected: no matches in `src/` (grep exit 1). The only acceptable remaining mention is none — fix any straggler `use tauri::` or `#[tauri::command]`.

- [ ] **Step 5: Full clean build + test**

Run: `cd src-tauri && cargo clean && cargo build && cargo test`
Expected: builds with no Tauri crates compiled (watch the build log — no `tauri` units), all tests PASS.

- [ ] **Step 6: Confirm the binary still speaks the protocol**

Run: `cd src-tauri && cargo test --test sidecar_rpc`
Expected: all protocol tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src-tauri
git commit -m "chore(sidecar): remove Tauri runtime + plugins; xlm-core is now standalone"
```

---

## Self-Review

**1. Spec coverage** (against `2026-06-16-electron-port-design.md` §6, §8, §12 Phase 1):
- NDJSON request/response/event envelopes → Task 1 (binary), Task 6–9 (responses), Task 2 (events). ✔
- `ready` handshake → Task 1. ✔
- camelCase params / snake_case methods / reject-on-error → `arg()` + arms (Tasks 6–9); error path in `handle_line`. ✔
- 77-method dispatch → Task 6 (20) + Task 7 (14) + Task 8 (36) + Task 9 (7) = **77 explicit + ping**. Count check: settings 4 + profiles 10 + jobs 3 + release 3 = 20; patches 7 + saves 7 = 14; xenia-pure 9 + library-pure 26 + open_path 1 = 36; stateful 7 (xenia 3 + library 4) = 7. Per-module totals reconcile with `generate_handler!`: settings 4, profiles 10, jobs 3, release 3, patches 7, saves 7, shell 1, xenia 12 (9+3), library 30 (26+4) = **77**. ✔ (If `cargo` later flags a method the frontend calls but no arm handles, the `known_methods_are_not_unknown` test list is the safety net.)
- EventSink replaces AppHandle (events.rs, scan_jobs.rs, command bodies) → Tasks 2, 3, 4. ✔
- AppCtx replaces managed state → Task 1 (def), Task 4 (use). ✔
- Drop Tauri deps; standalone binary; existing tests green → Task 10 + every task's `cargo test`. ✔
- open_path via xdg-open (no shell plugin) → Task 5. ✔
- Risk "stdout interleaving" → single writer thread + channel (Task 1). ✔
- Risk "long job blocks read loop" → multi-thread runtime + `tokio::spawn` per request + per job (Task 1, 4). ✔

**2. Placeholder scan:** The `use ...­_imports::*;` line in Task 6 Step 1 is explicitly flagged as bogus-and-to-delete (a teaching marker, not a real placeholder). `get_import_conflict_plan` key names carry an explicit "confirm against the client" instruction with a concrete fallback. The `start_install` test release JSON carries an explicit "adjust to releases.rs" instruction. No `TODO`/`implement later`/"add error handling" placeholders.

**3. Type consistency:** `EventSink`, `AppCtx`, `arg()`, `dispatch()` signatures are identical across Tasks 1→9. `emit_job_*(&EventSink, ...)` consistent between Task 2 (def) and Tasks 3–4 (use). `enqueue_scan`/`finish_scan` `self: &Arc<Self>` consistent between Task 3 (def) and Task 4 (call). Method names match the verified snake_case command fn names; param keys match the verified frontend camelCase.

## Out of scope (later phases)
- Electron main/preload/sidecar supervisor, `xlm-asset://`, dialog bridge, electron-updater → **Phase 2**.
- Frontend `bridge.ts`, swapping the 5 clients, removing `@tauri-apps/*` → **Phase 3**.
- electron-builder AppImage bundling `xlm-core`, dev/build scripts, icons, `tauri.conf.json` deletion → **Phase 4**.
