//! Owned application context — replaces Tauri's managed state container.

use std::sync::Arc;

use crate::events::EventSink;
use crate::jobs::JobRegistry;
use crate::library::scan_jobs::ScanCoordinator;

#[derive(Clone)]
pub struct AppCtx {
    pub jobs: Arc<JobRegistry>,
    pub scans: Arc<ScanCoordinator>,
    pub events: EventSink,
}

impl AppCtx {
    pub fn with_events(events: EventSink) -> Self {
        Self {
            jobs: Arc::new(JobRegistry::new()),
            scans: Arc::new(ScanCoordinator::new()),
            events,
        }
    }
}
