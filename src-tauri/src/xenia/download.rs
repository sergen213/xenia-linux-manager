//! Managed archive download pipeline for Xenia releases.
//!
//! Downloads a release archive into app-managed staging storage with
//! progress reporting. Does not write into the active Xenia directory;
//! the output is a staged archive file ready for extraction.
