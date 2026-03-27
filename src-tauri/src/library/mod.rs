//! Library source management and scan orchestration.
//!
//! Provides persisted library source registration, nested-source detection,
//! and background scan coordination that integrates with the shared job system.

pub mod artwork;
pub mod catalog;
pub mod content;
pub mod discovery;
pub mod identity;
pub mod launch;
pub mod review;
pub mod scan_jobs;
pub mod shortcuts;
pub mod sources;
pub mod steam;
pub mod titleid;
