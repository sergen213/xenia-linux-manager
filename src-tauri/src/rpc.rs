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
