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
