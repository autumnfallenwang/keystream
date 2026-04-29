//! Keystroke sender. Posts CGEvents via the `EventSource` trait.
//!
//! Locked decisions preserved:
//! - Q1: raw virtual keycodes via `char_to_keycode`, never unicode injection
//! - Q2: cliclick recipe for shift — plain keyDown(shift) / keyDown(char) /
//!   keyUp(char) / keyUp(shift) with `event_pause_ms` sleeps. NO `CGEventFlags`.
//! - Q3: shift warmup during countdown primes VM modifier state.
//! - Q12: event source is `Private` (see `event_source.rs::session_default`).
//! - Q14: `run_send` checks the `SendControlFlag` at every char boundary
//!   and exits cleanly with the position when pause/stop is requested.
//!   Resume is a fresh `run_send` call with `start_offset` matching the
//!   paused position.

use crate::config::{
    CLEAR_EDITOR_SETTLE_MS, DEFAULT_WARMUP_SHIFT, EVENT_PAUSE_MS, MOD_HOLD_MIN_MS, MOD_HOLD_MS,
    WARMUP_SETTLE_MS,
};
use crate::control::{SendControl, SendControlFlag};
use crate::error::Result;
use crate::event_source::EventSource;
use crate::keymap::{
    char_to_keycode, KEYCODE_A, KEYCODE_CONTROL, KEYCODE_DELETE, KEYCODE_RETURN, KEYCODE_SHIFT,
};
use std::thread;
use std::time::{Duration, Instant};

/// How often to invoke the optional progress callback (in chars typed).
/// At RDP's 10ms/char floor this is ~500ms — fast enough for the eye to
/// track the active-line indicator advancing, slow enough to avoid
/// flooding the IPC channel.
pub const PROGRESS_INTERVAL: usize = 50;

/// Timing configuration for the sender. Defaults read from
/// `crate::config` (see `SendCfg::default()`). The Tauri v2-3 handler
/// reads user-tunable values from `<app_data_dir>/settings.json` and
/// passes them in via this struct (Phase v2-5).
#[derive(Debug, Clone)]
pub struct SendCfg {
    /// Sleep after each key down/up event. poc2 floor: 7ms (RDP), 5ms (local).
    pub event_pause_ms: u64,
    /// Hold time between shift down/up and the char event (Q2).
    pub mod_hold_ms: u64,
    /// If true, do a dummy shift press+release before the first character (Q3).
    pub warmup_shift: bool,
}

impl Default for SendCfg {
    fn default() -> Self {
        Self {
            event_pause_ms: EVENT_PAUSE_MS,
            mod_hold_ms: MOD_HOLD_MS,
            warmup_shift: DEFAULT_WARMUP_SHIFT,
        }
    }
}

/// Why `run_send` returned. The Tauri handler maps this onto the
/// `send-paused` / `send-stopped` / `send-complete` events the
/// frontend consumes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExitReason {
    /// All chars in the input (after `start_offset`) were typed.
    Completed,
    /// `SendControl::PauseRequested` was observed at this char position.
    /// Position is the index of the next char that *would* have been
    /// typed (i.e. resume should pass `start_offset = position`).
    Paused { position: usize },
    /// `SendControl::StopRequested` was observed at this position.
    /// Frontend resets to position 0 — the position is reported only
    /// for telemetry / progress display.
    Stopped { position: usize },
}

/// Outcome of a send call. Carries everything the Tauri handler needs
/// to emit progress events and persist resume state.
#[derive(Debug, Clone)]
pub struct SendOutcome {
    pub reason: ExitReason,
    /// Number of chars whose keystrokes were posted (excluding skipped
    /// unmapped chars). For a `Completed` outcome, this equals
    /// `text.chars().count() - start_offset - skipped`.
    pub chars_typed: usize,
    /// Chars in the input range that were skipped because
    /// `char_to_keycode` returned `None` (non-ASCII letters etc).
    pub skipped: u64,
    /// Wall-clock duration of the send, from first event posted to last.
    pub duration_ms: u64,
}

/// Send a text buffer character-by-character, starting at `start_offset`
/// (a char index, not a byte index). Blocks for the duration of the send.
///
/// Per Q3, performs a shift warmup first if `cfg.warmup_shift` is true
/// AND `start_offset == 0` (warmup is a once-per-session priming; on
/// resume, modifier state is already primed from the first call).
///
/// Per Q14, checks `control.read()` at every char boundary and returns
/// cleanly on pause/stop. The flag is left in `Running` state on exit so
/// a subsequent call starts clean.
///
/// The optional `progress` callback is invoked every `PROGRESS_INTERVAL`
/// successfully-typed chars with the running `chars_typed` count. Used
/// by the Tauri shell to drive the live active-line indicator.
pub fn run_send(
    src: &dyn EventSource,
    text: &str,
    cfg: &SendCfg,
    control: &SendControlFlag,
    start_offset: usize,
    mut progress: Option<&mut dyn FnMut(usize)>,
) -> Result<SendOutcome> {
    let total_chars = text.chars().count();
    log::info!(
        "send: started chars={} start_offset={} warmup_shift={}",
        total_chars,
        start_offset,
        cfg.warmup_shift
    );

    if cfg.warmup_shift && start_offset == 0 {
        warmup_shift(src, cfg)?;
    }

    let start = Instant::now();
    let mut chars_typed = 0usize;
    let mut skipped = 0u64;

    for (i, ch) in text.chars().enumerate().skip(start_offset) {
        match control.read() {
            SendControl::Running => {}
            SendControl::PauseRequested => {
                control.set_running();
                let duration_ms = start.elapsed().as_millis() as u64;
                log::info!(
                    "send: paused at position={} chars_typed={} skipped={} duration_ms={}",
                    i,
                    chars_typed,
                    skipped,
                    duration_ms
                );
                return Ok(SendOutcome {
                    reason: ExitReason::Paused { position: i },
                    chars_typed,
                    skipped,
                    duration_ms,
                });
            }
            SendControl::StopRequested => {
                control.set_running();
                let duration_ms = start.elapsed().as_millis() as u64;
                log::info!(
                    "send: stopped at position={} chars_typed={} skipped={} duration_ms={}",
                    i,
                    chars_typed,
                    skipped,
                    duration_ms
                );
                return Ok(SendOutcome {
                    reason: ExitReason::Stopped { position: i },
                    chars_typed,
                    skipped,
                    duration_ms,
                });
            }
        }

        let prev_chars_typed = chars_typed;
        if ch == '\n' {
            tap_key(src, KEYCODE_RETURN, cfg)?;
            chars_typed += 1;
        } else if ch == '\r' {
            // handled by \n
        } else {
            match char_to_keycode(ch) {
                Some((code, shift)) => {
                    send_char(src, code, shift, cfg)?;
                    chars_typed += 1;
                }
                None => {
                    log::warn!("send: skip unmapped_codepoint={:#x}", ch as u32);
                    skipped += 1;
                }
            }
        }
        if chars_typed > prev_chars_typed && chars_typed % PROGRESS_INTERVAL == 0 {
            if let Some(cb) = progress.as_mut() {
                cb(chars_typed);
            }
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    log::info!(
        "send: complete chars_typed={} skipped={} duration_ms={}",
        chars_typed,
        skipped,
        duration_ms
    );
    Ok(SendOutcome {
        reason: ExitReason::Completed,
        chars_typed,
        skipped,
        duration_ms,
    })
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
/// for Ctrl+A etc. against RDP.
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

/// Clear the target editor: Ctrl+A (select all), then Backspace.
pub fn clear_editor(src: &dyn EventSource, cfg: &SendCfg) -> Result<()> {
    src.post_key(KEYCODE_CONTROL, true)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(KEYCODE_A, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(KEYCODE_A, false)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    src.post_key(KEYCODE_CONTROL, false)?;
    thread::sleep(Duration::from_millis(CLEAR_EDITOR_SETTLE_MS));
    src.post_key(KEYCODE_DELETE, true)?;
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    src.post_key(KEYCODE_DELETE, false)?;
    thread::sleep(Duration::from_millis(CLEAR_EDITOR_SETTLE_MS));
    Ok(())
}

/// Shift warmup (Q3). Primes the VM's modifier state so the first
/// shifted character doesn't drop.
pub fn warmup_shift(src: &dyn EventSource, cfg: &SendCfg) -> Result<()> {
    src.post_key(KEYCODE_SHIFT, true)?;
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms.max(MOD_HOLD_MIN_MS)));
    src.post_key(KEYCODE_SHIFT, false)?;
    thread::sleep(Duration::from_millis(WARMUP_SETTLE_MS));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_source::test_util::RecordingEventSource;

    fn fast_cfg() -> SendCfg {
        SendCfg {
            event_pause_ms: 0,
            mod_hold_ms: 0,
            warmup_shift: false,
        }
    }

    fn flag() -> SendControlFlag {
        SendControlFlag::new()
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
        let cfg = SendCfg {
            warmup_shift: true,
            ..fast_cfg()
        };
        let outcome = run_send(&src, "a", &cfg, &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 1);
        let events = src.events.borrow();
        // [warmup shift down, warmup shift up, 'a' down, 'a' up]
        assert_eq!(events.len(), 4);
        assert_eq!(events[0], (KEYCODE_SHIFT, true));
        assert_eq!(events[1], (KEYCODE_SHIFT, false));
        assert_eq!(events[2], (0, true));
        assert_eq!(events[3], (0, false));
    }

    #[test]
    fn run_send_without_warmup_uses_recipe_directly() {
        let src = RecordingEventSource::new();
        let outcome = run_send(&src, "A", &fast_cfg(), &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
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
        let outcome = run_send(&src, "\n", &fast_cfg(), &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 1);
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
        let outcome = run_send(&src, "é", &fast_cfg(), &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 0);
        assert_eq!(outcome.skipped, 1);
        let events = src.events.borrow();
        assert_eq!(events.len(), 0);
    }

    // ---- Q14 SendControl integration ----

    #[test]
    fn run_send_pause_at_position() {
        // Pre-flip the flag to PauseRequested. The loop should observe
        // it on the first iteration (i=0) and return Paused { position: 0 }.
        let src = RecordingEventSource::new();
        let f = flag();
        f.request_pause();
        let outcome = run_send(&src, "abcdef", &fast_cfg(), &f, 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Paused { position: 0 });
        assert_eq!(outcome.chars_typed, 0);
        // No keystrokes posted.
        assert_eq!(src.events.borrow().len(), 0);
        // Flag was reset to Running on exit.
        assert_eq!(f.read(), SendControl::Running);
    }

    #[test]
    fn run_send_stop_at_position() {
        let src = RecordingEventSource::new();
        let f = flag();
        f.request_stop();
        let outcome = run_send(&src, "abcdef", &fast_cfg(), &f, 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Stopped { position: 0 });
        assert_eq!(outcome.chars_typed, 0);
        assert_eq!(f.read(), SendControl::Running);
    }

    #[test]
    fn run_send_start_offset_skips_prefix() {
        // start_offset=3 → skip "abc", type "def".
        let src = RecordingEventSource::new();
        let outcome = run_send(&src, "abcdef", &fast_cfg(), &flag(), 3, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 3);
        // 'd'=2 'e'=14 'f'=3 keycodes (US-ANSI). Each posts down+up.
        let events = src.events.borrow();
        assert_eq!(events.len(), 6);
        assert_eq!(events[0].0, 2); // 'd' down
        assert_eq!(events[2].0, 14); // 'e' down
        assert_eq!(events[4].0, 3); // 'f' down
    }

    #[test]
    fn run_send_completes_full_text() {
        let src = RecordingEventSource::new();
        let outcome = run_send(&src, "abc", &fast_cfg(), &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 3);
        assert_eq!(outcome.skipped, 0);
    }

    #[test]
    fn run_send_skips_warmup_when_resuming() {
        // start_offset > 0 means we're resuming → no warmup.
        let src = RecordingEventSource::new();
        let cfg = SendCfg {
            warmup_shift: true,
            ..fast_cfg()
        };
        let outcome = run_send(&src, "abc", &cfg, &flag(), 1, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        let events = src.events.borrow();
        // No leading warmup shift pair; just 'b' and 'c' (4 events).
        assert_eq!(events.len(), 4);
        assert_eq!(events[0].0, 11); // 'b'
    }

    // ---- Progress callback (B-02) ----

    #[test]
    fn run_send_invokes_progress_callback_at_interval_boundaries() {
        // 200 'a' chars → callback should fire at 50, 100, 150, 200.
        let src = RecordingEventSource::new();
        let text = "a".repeat(200);
        let mut ticks: Vec<usize> = Vec::new();
        let mut progress = |n: usize| ticks.push(n);
        let outcome = run_send(&src, &text, &fast_cfg(), &flag(), 0, Some(&mut progress)).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 200);
        assert_eq!(ticks, vec![50, 100, 150, 200]);
    }

    #[test]
    fn run_send_omits_callback_when_text_shorter_than_interval() {
        // 30 chars never reaches the 50-char threshold — no progress emit.
        let src = RecordingEventSource::new();
        let text = "a".repeat(30);
        let mut ticks: Vec<usize> = Vec::new();
        let mut progress = |n: usize| ticks.push(n);
        let outcome = run_send(&src, &text, &fast_cfg(), &flag(), 0, Some(&mut progress)).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 30);
        assert!(ticks.is_empty());
    }

    #[test]
    fn run_send_progress_callback_optional_none_is_no_op() {
        // Sanity: passing None doesn't panic and still completes correctly.
        let src = RecordingEventSource::new();
        let text = "a".repeat(100);
        let outcome = run_send(&src, &text, &fast_cfg(), &flag(), 0, None).unwrap();
        assert_eq!(outcome.reason, ExitReason::Completed);
        assert_eq!(outcome.chars_typed, 100);
    }
}
