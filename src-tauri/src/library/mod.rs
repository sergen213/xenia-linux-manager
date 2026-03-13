//! Library source management and scan orchestration.
//!
//! Provides persisted library source registration, nested-source detection,
//! and background scan coordination that integrates with the shared job system.

pub mod catalog;
pub mod discovery;
pub mod scan_jobs;
pub mod sources;
