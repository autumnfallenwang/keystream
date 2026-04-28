//! Alternate keystroke-injection methods to compare against the
//! shipped typer-core sandwich recipe.
//!
//! Reference: poc2/methods.md.

use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use std::thread;
use std::time::Duration;
use typer_core::error::{Result, TyperError};
use typer_core::keymap::{char_to_keycode, KEYCODE_RETURN};

/// Injection method for the `local` probe.
#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum InjectMethod {
    /// Current Q2 cliclick recipe: shift-down, char-down, char-up, shift-up.
    /// Three separate events around each shifted char. Delegates to
    /// typer-core's `run_send`.
    Sandwich,
    /// KeePassXC pattern: a single CGEvent for the char with
    /// `CGEventFlags::CGEventFlagShift` set. No separate shift events.
    FlagOnChar,
}

/// Tap location override. Maps 1:1 onto `CGEventTapLocation`.
#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum TapLoc {
    Session,
    Hid,
    Annotated,
}

impl From<TapLoc> for CGEventTapLocation {
    fn from(t: TapLoc) -> Self {
        match t {
            TapLoc::Session => CGEventTapLocation::Session,
            TapLoc::Hid => CGEventTapLocation::HID,
            TapLoc::Annotated => CGEventTapLocation::AnnotatedSession,
        }
    }
}

/// Event source override.
#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum SourceState {
    Combined,
    Private,
    Hid,
}

impl From<SourceState> for CGEventSourceStateID {
    fn from(s: SourceState) -> Self {
        match s {
            SourceState::Combined => CGEventSourceStateID::CombinedSessionState,
            SourceState::Private => CGEventSourceStateID::Private,
            SourceState::Hid => CGEventSourceStateID::HIDSystemState,
        }
    }
}

/// Type `text` using the flag-on-char method. Posts events directly to
/// `tap_loc` from a CGEventSource built off `state`. Sleeps
/// `event_pause_ms` after each event, `char_pause_ms` between chars.
///
/// Skipped chars (not in keymap) are silently dropped — same as the
/// sandwich path. Caller logs counts.
pub fn run_send_flag_on_char(
    text: &str,
    state: SourceState,
    tap_loc: TapLoc,
    event_pause_ms: u64,
    char_pause_ms: u64,
) -> Result<()> {
    let source = CGEventSource::new(state.into()).map_err(|_| TyperError::EventSourceFailed {
        state_id: state_id_name(state.into()),
    })?;
    let tap: CGEventTapLocation = tap_loc.into();

    let mut skipped = 0u64;
    for ch in text.chars() {
        if ch == '\r' {
            continue;
        }
        let (code, shift) = if ch == '\n' {
            (KEYCODE_RETURN, false)
        } else {
            match char_to_keycode(ch) {
                Some(pair) => pair,
                None => {
                    skipped += 1;
                    continue;
                }
            }
        };

        // Set flags on EVERY event — empty for unshifted, shift for shifted.
        // Without explicit empty-flag on unshifted events, shift state from
        // the previous shifted char leaks forward (observed 02c run 1:
        // every char came out as if shift were held the whole time).
        // Hammerspoon does this deliberately for the same reason.
        let flags = if shift {
            CGEventFlags::CGEventFlagShift
        } else {
            CGEventFlags::empty()
        };

        let down = CGEvent::new_keyboard_event(source.clone(), code, true)
            .map_err(|_| TyperError::KeyboardEventFailed { keycode: code })?;
        down.set_flags(flags);
        down.post(tap);
        thread::sleep(Duration::from_millis(event_pause_ms));

        let up = CGEvent::new_keyboard_event(source.clone(), code, false)
            .map_err(|_| TyperError::KeyboardEventFailed { keycode: code })?;
        up.set_flags(flags);
        up.post(tap);
        thread::sleep(Duration::from_millis(event_pause_ms));

        if char_pause_ms > 0 {
            thread::sleep(Duration::from_millis(char_pause_ms));
        }
    }

    log::info!(
        "flag_on_char: complete chars={} skipped={}",
        text.chars().count(),
        skipped
    );
    Ok(())
}

fn state_id_name(s: CGEventSourceStateID) -> &'static str {
    match s {
        CGEventSourceStateID::Private => "private",
        CGEventSourceStateID::CombinedSessionState => "combined",
        CGEventSourceStateID::HIDSystemState => "hid",
    }
}
