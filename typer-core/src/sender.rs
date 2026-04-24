//! Keystroke sender. Posts CGEvents via the `EventSource` trait.
//!
//! Locked decisions preserved:
//! - Q1: raw virtual keycodes via `char_to_keycode`, never unicode injection
//! - Q2: cliclick recipe for shift — plain keyDown(shift) / keyDown(char) /
//!   keyUp(char) / keyUp(shift) with `event_pause_ms` sleeps. NO `CGEventFlags`.
//! - Q3: shift warmup during countdown primes VM modifier state.

use crate::error::Result;
use crate::event_source::EventSource;
use crate::keymap::{
    char_to_keycode, KEYCODE_A, KEYCODE_CONTROL, KEYCODE_DELETE, KEYCODE_RETURN, KEYCODE_SHIFT,
};
use rand::Rng;
use std::thread;
use std::time::Duration;

/// Timing configuration for the sender. Defaults match the PoC proven
/// against AVD (docs/poc/typer/src/main.rs). Task 9 will move these
/// defaults into a central `config.rs` consts file.
#[derive(Debug, Clone)]
pub struct SendCfg {
    /// Sleep after each key down/up event (matches cliclick's 10ms).
    pub event_pause_ms: u64,
    /// Extra pause between characters.
    pub char_pause_ms: u64,
    /// Random jitter added to `char_pause_ms` per char.
    pub jitter_ms: u64,
    /// Hold time between shift down/up and the char event.
    pub mod_hold_ms: u64,
    /// If true, do a dummy shift press+release before the first character.
    pub warmup_shift: bool,
}

impl Default for SendCfg {
    fn default() -> Self {
        Self {
            event_pause_ms: 10,
            char_pause_ms: 0,
            jitter_ms: 0,
            mod_hold_ms: 10,
            warmup_shift: true,
        }
    }
}

/// Send a full text buffer character-by-character. Blocks for the
/// duration of the send. Emits no events during; observers wire progress
/// via higher-level APIs (task 8 `send_chunk` for chunked mode).
///
/// Per Q3, performs a shift warmup first if `cfg.warmup_shift` is true.
pub fn run_send(src: &dyn EventSource, text: &str, cfg: &SendCfg) -> Result<()> {
    log::info!(
        "send: started chars={} warmup_shift={}",
        text.chars().count(),
        cfg.warmup_shift
    );

    if cfg.warmup_shift {
        warmup_shift(src, cfg)?;
    }

    let mut rng = rand::thread_rng();
    let mut skipped = 0u64;

    for ch in text.chars() {
        if ch == '\n' {
            tap_key(src, KEYCODE_RETURN, cfg)?;
        } else if ch == '\r' {
            // handled by \n
        } else {
            match char_to_keycode(ch) {
                Some((code, shift)) => {
                    send_char(src, code, shift, cfg)?;
                }
                None => {
                    // Log the hex codepoint, not the char itself (rules/security.md:
                    // don't log sent content). Counts and codes are fine.
                    log::warn!("send: skip unmapped_codepoint={:#x}", ch as u32);
                    skipped += 1;
                }
            }
        }

        let jitter = if cfg.jitter_ms == 0 {
            0
        } else {
            rng.gen_range(0..=cfg.jitter_ms)
        };
        if cfg.char_pause_ms + jitter > 0 {
            thread::sleep(Duration::from_millis(cfg.char_pause_ms + jitter));
        }
    }

    log::info!(
        "send: complete chars={} skipped={}",
        text.chars().count(),
        skipped
    );
    Ok(())
}

/// Send a single character with optional shift (Q2 cliclick recipe).
pub fn send_char(src: &dyn EventSource, code: u16, shift: bool, cfg: &SendCfg) -> Result<()> {
    if shift {
        src.post_key(KEYCODE_SHIFT, true)?;
        thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    }
    src.post_key(code, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(code, false)?;
    if shift {
        thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
        src.post_key(KEYCODE_SHIFT, false)?;
        thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    }
    Ok(())
}

/// Tap a single key (down then up) with the standard event pause.
pub fn tap_key(src: &dyn EventSource, keycode: u16, cfg: &SendCfg) -> Result<()> {
    src.post_key(keycode, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(keycode, false)?;
    Ok(())
}

/// Ctrl-combo using the cliclick recipe (raw keycodes, no flags). Works
/// for Ctrl+A etc. against AVD.
pub fn send_ctrl_combo(src: &dyn EventSource, keycode: u16, cfg: &SendCfg) -> Result<()> {
    src.post_key(KEYCODE_CONTROL, true)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(keycode, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(keycode, false)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(KEYCODE_CONTROL, false)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    Ok(())
}

/// Clear the target editor: Ctrl+A (select all), then Backspace. Used
/// between stress runs to wipe Notepad; NOT used for per-chunk retry
/// (Q10: v1 doesn't auto-rollback).
pub fn clear_editor(src: &dyn EventSource, cfg: &SendCfg) -> Result<()> {
    src.post_key(KEYCODE_CONTROL, true)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(KEYCODE_A, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(KEYCODE_A, false)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(KEYCODE_CONTROL, false)?;
    thread::sleep(Duration::from_millis(150));
    src.post_key(KEYCODE_DELETE, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(KEYCODE_DELETE, false)?;
    thread::sleep(Duration::from_millis(150));
    Ok(())
}

/// Shift warmup (Q3). Primes the VM's modifier state so the first
/// shifted character doesn't drop.
pub fn warmup_shift(src: &dyn EventSource, cfg: &SendCfg) -> Result<()> {
    src.post_key(KEYCODE_SHIFT, true)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms.max(10)));
    src.post_key(KEYCODE_SHIFT, false)?;
    thread::sleep(Duration::from_millis(50));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_source::test_util::RecordingEventSource;

    fn fast_cfg() -> SendCfg {
        SendCfg {
            event_pause_ms: 0,
            char_pause_ms: 0,
            jitter_ms: 0,
            mod_hold_ms: 0,
            warmup_shift: false,
        }
    }

    #[test]
    fn send_char_unshifted_posts_down_then_up() {
        let src = RecordingEventSource::new();
        send_char(&src, 0, false, &fast_cfg()).unwrap();
        let events = src.events.borrow();
        assert_eq!(*events, vec![(0, true), (0, false)]);
    }

    #[test]
    fn send_char_shifted_follows_cliclick_recipe() {
        // Q2: shift-down → char-down → char-up → shift-up. No flags.
        let src = RecordingEventSource::new();
        send_char(&src, 0, true, &fast_cfg()).unwrap();
        let events = src.events.borrow();
        assert_eq!(
            *events,
            vec![
                (KEYCODE_SHIFT, true),
                (0, true),
                (0, false),
                (KEYCODE_SHIFT, false),
            ]
        );
    }

    #[test]
    fn run_send_with_warmup_prepends_shift_pair() {
        // Q3: warmup fires shift-down, shift-up before anything else.
        let src = RecordingEventSource::new();
        let mut cfg = fast_cfg();
        cfg.warmup_shift = true;
        run_send(&src, "a", &cfg).unwrap();
        let events = src.events.borrow();
        // Expected: [warmup shift down, warmup shift up, 'a' down, 'a' up]
        assert_eq!(events.len(), 4);
        assert_eq!(events[0], (KEYCODE_SHIFT, true));
        assert_eq!(events[1], (KEYCODE_SHIFT, false));
        assert_eq!(events[2], (0, true));
        assert_eq!(events[3], (0, false));
    }

    #[test]
    fn run_send_without_warmup_drops_first_shifted_char_scenario() {
        // Documents the bug Q3 prevents: without warmup, first event is
        // the shifted char's shift-down directly — no primed modifier.
        // This test pins the untreated behavior so we notice if warmup
        // default ever changes.
        let src = RecordingEventSource::new();
        let cfg = fast_cfg(); // warmup_shift: false
        run_send(&src, "A", &cfg).unwrap();
        let events = src.events.borrow();
        assert_eq!(
            *events,
            vec![
                (KEYCODE_SHIFT, true),
                (0, true),
                (0, false),
                (KEYCODE_SHIFT, false),
            ]
        );
    }

    #[test]
    fn run_send_newline_posts_return_key() {
        let src = RecordingEventSource::new();
        run_send(&src, "\n", &fast_cfg()).unwrap();
        let events = src.events.borrow();
        assert_eq!(
            *events,
            vec![(KEYCODE_RETURN, true), (KEYCODE_RETURN, false)]
        );
    }

    #[test]
    fn run_send_skips_unmapped_without_error() {
        let src = RecordingEventSource::new();
        // 'é' is not in the US-ANSI keymap — must skip, not fail.
        run_send(&src, "é", &fast_cfg()).unwrap();
        let events = src.events.borrow();
        assert_eq!(events.len(), 0);
    }
}
