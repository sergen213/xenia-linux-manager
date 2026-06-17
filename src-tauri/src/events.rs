//! Output event sink. Replaces Tauri's app-handle emit for the sidecar.
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
