//! Event source abstraction. Production impl wraps `core-graphics` and
//! posts CGEvents; test impl records calls so sender logic is unit-testable
//! without posting real keystrokes (see rules/testing.md).

use crate::error::{Result, TyperError};
use core_graphics::event::{CGEvent, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

/// Post keyboard events. Errors only on underlying CGEvent creation
/// failure; posting itself is fire-and-forget in `core-graphics`.
pub trait EventSource {
    fn post_key(&self, keycode: u16, down: bool) -> Result<()>;
}

pub struct RealEventSource {
    source: CGEventSource,
    tap_loc: CGEventTapLocation,
}

impl RealEventSource {
    pub fn new(state_id: CGEventSourceStateID, tap_loc: CGEventTapLocation) -> Result<Self> {
        let source = CGEventSource::new(state_id).map_err(|_| TyperError::EventSourceFailed {
            state_id: state_id_name(state_id),
        })?;
        Ok(Self { source, tap_loc })
    }

    /// Convenience constructor for the session default: `Private` source
    /// state with `Session` tap location. Locked decision Q12 — the
    /// `CombinedSessionState` default mixes our injected events with the
    /// user's physical keyboard state and corrupts modifier tracking under
    /// sustained typing, surfacing as intermittent shift-drops on AVD/RDP
    /// targets. `Private` gives our injection an isolated modifier-state
    /// machine. Validated 0 / 45,051 chars across 3 × 15k-char runs on
    /// AVD/Notepad — see [`docs/poc2-results.md`].
    ///
    /// Lets callers outside `typer-core` (Tauri commands, CLI shim)
    /// construct an event source without pulling in `core-graphics` as a
    /// direct dep.
    pub fn session_default() -> Result<Self> {
        Self::new(CGEventSourceStateID::Private, CGEventTapLocation::Session)
    }
}

impl EventSource for RealEventSource {
    fn post_key(&self, keycode: u16, down: bool) -> Result<()> {
        let ev = CGEvent::new_keyboard_event(self.source.clone(), keycode, down)
            .map_err(|_| TyperError::KeyboardEventFailed { keycode })?;
        ev.post(self.tap_loc);
        Ok(())
    }
}

fn state_id_name(s: CGEventSourceStateID) -> &'static str {
    match s {
        CGEventSourceStateID::Private => "private",
        CGEventSourceStateID::CombinedSessionState => "combined",
        CGEventSourceStateID::HIDSystemState => "hid",
    }
}

#[cfg(test)]
pub mod test_util {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    pub struct RecordingEventSource {
        pub events: RefCell<Vec<(u16, bool)>>,
    }

    impl RecordingEventSource {
        pub fn new() -> Self {
            Self::default()
        }
    }

    impl EventSource for RecordingEventSource {
        fn post_key(&self, keycode: u16, down: bool) -> Result<()> {
            self.events.borrow_mut().push((keycode, down));
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_util::RecordingEventSource;
    use super::EventSource;

    #[test]
    fn recording_source_records_events() {
        let src = RecordingEventSource::new();
        src.post_key(36, true).unwrap();
        src.post_key(36, false).unwrap();
        let events = src.events.borrow();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0], (36, true));
        assert_eq!(events[1], (36, false));
    }
}
