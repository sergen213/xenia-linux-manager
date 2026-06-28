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
