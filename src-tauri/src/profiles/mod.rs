//! Per-game configuration profile management.
//!
//! Provides backend-owned profile storage, sparse-override merge logic,
//! and effective-settings computation for Xenia game profiles.

pub mod merge;
pub mod sources;
pub mod storage;
