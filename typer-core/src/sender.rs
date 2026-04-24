//! Keystroke sender. Posts CGEvents via the `EventSource` trait.
//!
//! Locked decisions preserved:
//! - Q1: raw virtual keycodes via `char_to_keycode`, never unicode injection
//! - Q2: cliclick recipe for shift — plain keyDown(shift) / keyDown(char) /
//!   keyUp(char) / keyUp(shift) with `event_pause_ms` sleeps. NO `CGEventFlags`.
//! - Q3: shift warmup during countdown primes VM modifier state.

use crate::config::{
    CHUNK_SIZE_LINES, CLEAR_EDITOR_SETTLE_MS, DEFAULT_WARMUP_SHIFT, EVENT_PAUSE_MS,
    MOD_HOLD_MIN_MS, MOD_HOLD_MS, WARMUP_SETTLE_MS,
};
use crate::error::Result;
use crate::event_source::EventSource;
use crate::keymap::{
    char_to_keycode, KEYCODE_A, KEYCODE_CONTROL, KEYCODE_DELETE, KEYCODE_RETURN, KEYCODE_SHIFT,
};
use rand::Rng;
use std::thread;
use std::time::Duration;

/// Timing configuration for the sender. Defaults read from
/// `crate::config` (see `SendCfg::default()`). v1 clients use
/// `SendCfg::default()`; Phase-5 settings UI will expose knobs.
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
            event_pause_ms: EVENT_PAUSE_MS,
            char_pause_ms: 0,
            jitter_ms: 0,
            mod_hold_ms: MOD_HOLD_MS,
            warmup_shift: DEFAULT_WARMUP_SHIFT,
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

/// Type a chunk of N source lines into the target editor. Each line is
/// typed char-by-char (via `send_char`), followed by a newline. The
/// final line also gets a trailing newline so the cursor ends at the
/// start of the next logical line, ready for the next chunk.
///
/// Does NOT perform shift warmup. The caller (typically the Tauri
/// orchestrator driving the chunked loop) is responsible for calling
/// `warmup_shift` once before the first chunk (Q3) so warmup overhead
/// is paid once per session, not once per chunk.
///
/// Skipped unmapped chars are logged at WARN with their hex codepoint
/// (never the char itself — rules/security.md).
pub fn send_chunk(src: &dyn EventSource, lines: &[&str], cfg: &SendCfg) -> Result<()> {
    let total_chars: usize = lines.iter().map(|l| l.chars().count()).sum();
    log::info!(
        "send_chunk: started lines={} chars={}",
        lines.len(),
        total_chars
    );

    let mut rng = rand::thread_rng();
    let mut skipped = 0u64;

    for line in lines {
        for ch in line.chars() {
            match char_to_keycode(ch) {
                Some((code, shift)) => {
                    send_char(src, code, shift, cfg)?;
                }
                None => {
                    log::warn!("send_chunk: skip unmapped_codepoint={:#x}", ch as u32);
                    skipped += 1;
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
        tap_key(src, KEYCODE_RETURN, cfg)?;
    }

    log::info!(
        "send_chunk: complete lines={} chars={} skipped={}",
        lines.len(),
        total_chars,
        skipped
    );
    Ok(())
}

/// Split `text` by `\n` and group into chunks of `CHUNK_SIZE_LINES`
/// source lines. Trailing partial chunk (fewer than CHUNK_SIZE_LINES
/// lines) is included. Empty input returns an empty vec.
pub fn chunk_text(text: &str) -> Vec<Vec<String>> {
    if text.is_empty() {
        return Vec::new();
    }
    text.lines()
        .map(String::from)
        .collect::<Vec<_>>()
        .chunks(CHUNK_SIZE_LINES)
        .map(<[String]>::to_vec)
        .collect()
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

    // ---- task 8: send_chunk + chunk_text ----

    #[test]
    fn send_chunk_emits_chars_then_newline_per_line() {
        // Each line's chars are posted (down/up per char), followed by a
        // RETURN down/up. The FINAL line also gets a trailing RETURN so
        // the cursor is at the start of the next logical line.
        let src = RecordingEventSource::new();
        send_chunk(&src, &["ab", "cd"], &fast_cfg()).unwrap();
        let events = src.events.borrow();
        // 'a' keycode 0, 'b' keycode 11, 'c' keycode 8, 'd' keycode 2
        assert_eq!(
            *events,
            vec![
                (0, true),
                (0, false),
                (11, true),
                (11, false),
                (KEYCODE_RETURN, true),
                (KEYCODE_RETURN, false),
                (8, true),
                (8, false),
                (2, true),
                (2, false),
                (KEYCODE_RETURN, true),
                (KEYCODE_RETURN, false),
            ]
        );
    }

    #[test]
    fn send_chunk_empty_lines_only_post_returns() {
        let src = RecordingEventSource::new();
        send_chunk(&src, &["", ""], &fast_cfg()).unwrap();
        let events = src.events.borrow();
        assert_eq!(
            *events,
            vec![
                (KEYCODE_RETURN, true),
                (KEYCODE_RETURN, false),
                (KEYCODE_RETURN, true),
                (KEYCODE_RETURN, false),
            ]
        );
    }

    #[test]
    fn send_chunk_does_not_warmup() {
        // Contract: send_chunk never warms up — the caller does it once
        // before the first chunk. For "A" the first event is shift-down
        // (part of the send_char cliclick recipe), not a standalone
        // warmup shift-down/up pair preceding the char.
        let src = RecordingEventSource::new();
        send_chunk(&src, &["A"], &fast_cfg()).unwrap();
        let events = src.events.borrow();
        // Expected: shift-down (recipe), 'A' (code 0) down, 'A' up, shift-up, RETURN down, RETURN up
        assert_eq!(
            *events,
            vec![
                (KEYCODE_SHIFT, true),
                (0, true),
                (0, false),
                (KEYCODE_SHIFT, false),
                (KEYCODE_RETURN, true),
                (KEYCODE_RETURN, false),
            ]
        );
    }

    #[test]
    fn chunk_text_splits_into_5_line_groups() {
        let text = (1..=12)
            .map(|i| format!("line{i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 5);
        assert_eq!(chunks[1].len(), 5);
        assert_eq!(chunks[2].len(), 2);
        assert_eq!(chunks[0][0], "line1");
        assert_eq!(chunks[2][1], "line12");
    }

    #[test]
    fn chunk_text_empty_returns_empty() {
        assert!(chunk_text("").is_empty());
    }

    #[test]
    fn chunk_text_exactly_one_chunk_boundary() {
        // Exactly CHUNK_SIZE_LINES (5) lines = one chunk of 5, no trailing.
        let text = "a\nb\nc\nd\ne";
        let chunks = chunk_text(text);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), 5);
    }
}
