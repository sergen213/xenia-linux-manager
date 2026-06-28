//! Small shared helpers.

/// Milliseconds since the UNIX epoch (saturating to 0 if the clock is before it).
pub(crate) fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
