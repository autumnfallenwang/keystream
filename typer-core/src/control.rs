//! Q14 send-loop control flag. Tri-state coordinator for `run_send`'s
//! pause / stop semantics.
//!
//! The send loop reads the flag at every char boundary (cheap atomic
//! load); external callers (the Tauri command handler in v2-3) flip it
//! to request pause or stop. Resume is not a control flag operation —
//! it's a fresh `run_send` call with a `start_offset` matching the
//! position the previous run paused at.
//!
//! Cross-thread safe via `Arc<AtomicU8>` so a Tauri worker thread can
//! own the send loop while the main thread mutates the flag.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

const RUNNING: u8 = 0;
const PAUSE_REQUESTED: u8 = 1;
const STOP_REQUESTED: u8 = 2;

/// Snapshot of the control flag's state at a single read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SendControl {
    Running,
    PauseRequested,
    StopRequested,
}

/// Shared, cheap, atomic control flag for the send loop. Cloning is
/// cheap (shares the underlying `Arc`), so callers can hand a clone to
/// the worker thread that runs `run_send` and keep one to flip from the
/// outside.
#[derive(Clone, Default)]
pub struct SendControlFlag(Arc<AtomicU8>);

impl SendControlFlag {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the flag back to `Running`. Call this after observing a
    /// pause/stop request so a subsequent `run_send` starts clean.
    pub fn set_running(&self) {
        self.0.store(RUNNING, Ordering::Release);
    }

    /// Request the send loop to pause at the next char boundary.
    pub fn request_pause(&self) {
        self.0.store(PAUSE_REQUESTED, Ordering::Release);
    }

    /// Request the send loop to stop at the next char boundary.
    pub fn request_stop(&self) {
        self.0.store(STOP_REQUESTED, Ordering::Release);
    }

    /// Read the current state. Cheap; safe to call in a tight loop.
    pub fn read(&self) -> SendControl {
        match self.0.load(Ordering::Acquire) {
            PAUSE_REQUESTED => SendControl::PauseRequested,
            STOP_REQUESTED => SendControl::StopRequested,
            _ => SendControl::Running,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_starts_running() {
        assert_eq!(SendControlFlag::new().read(), SendControl::Running);
    }

    #[test]
    fn request_pause_observable() {
        let f = SendControlFlag::new();
        f.request_pause();
        assert_eq!(f.read(), SendControl::PauseRequested);
    }

    #[test]
    fn request_stop_observable() {
        let f = SendControlFlag::new();
        f.request_stop();
        assert_eq!(f.read(), SendControl::StopRequested);
    }

    #[test]
    fn set_running_clears_pause() {
        let f = SendControlFlag::new();
        f.request_pause();
        f.set_running();
        assert_eq!(f.read(), SendControl::Running);
    }

    #[test]
    fn arc_clone_shares_state() {
        let f = SendControlFlag::new();
        let f2 = f.clone();
        f.request_stop();
        assert_eq!(f2.read(), SendControl::StopRequested);
    }
}
