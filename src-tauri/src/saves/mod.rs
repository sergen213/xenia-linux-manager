//! Save portability and safety domain.
//!
//! Provides backend-owned save path resolution, portable archive packaging
//! with manifest metadata, staged import inspection with conflict planning,
//! and backup-before-apply behavior for overwrite-capable imports.

pub mod archive;
pub mod import;
pub mod paths;
pub mod storage;
