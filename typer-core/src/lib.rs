#![cfg(target_os = "macos")]
//! typer-core — keystroke sender for Keystream (v2).
//!
//! Linear send loop, no OCR. Locked decisions:
//!
//! - Q1: CGEvent virtual keycodes, never unicode injection
//! - Q2: cliclick shift recipe (plain keycodes, no `CGEventFlags`)
//! - Q3: shift warmup before the first character
//! - Q12: `CGEventSourceStateID::Private` source — eliminates AVD
//!   shift-drops. See `docs/poc2-results.md`.
//! - Q14: `SendControl` tri-state for pause/resume/stop. Resume is
//!   `run_send` with a `start_offset`, not a separate command.
//!
//! v1's OCR pipeline (verify, align, fold, stitch, scroll, region,
//! lint, diff) was retired in v2-2; see git history before this commit
//! and `docs/poc2-results.md` for the rationale.

pub mod config;
pub mod control;
pub mod error;
pub mod event_source;
pub mod keymap;
pub mod sender;

pub use config::{
    CLEAR_EDITOR_SETTLE_MS, COUNTDOWN_SECS, DEFAULT_WARMUP_SHIFT, EVENT_PAUSE_MS, MOD_HOLD_MIN_MS,
    MOD_HOLD_MS, WARMUP_SETTLE_MS,
};
pub use control::{SendControl, SendControlFlag};
pub use error::{Result, TyperError};
pub use event_source::{EventSource, RealEventSource};
pub use sender::{
    clear_editor, run_send, send_char, send_ctrl_combo, tap_key, warmup_shift, ExitReason, SendCfg,
    SendOutcome,
};
