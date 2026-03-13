//! Xenia emulator lifecycle subsystem.
//!
//! Manages release discovery, download, extraction, and installation of
//! Linux Xenia Canary builds. All release metadata is fetched from the
//! GitHub releases API rather than hardcoded URLs so stale documentation
//! cannot silently break installs.

pub mod archive;
pub mod download;
pub mod install;
pub mod releases;
