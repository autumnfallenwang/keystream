#![cfg(target_os = "macos")]
//! typer-core — keystroke sender and OCR verify loop for Keystream.
//!
//! Ported from `docs/poc/typer/src/main.rs` in task 7. Preserves locked
//! decisions Q1–Q6 (see `docs/design-plan.md`):
//!
//! - Q1: CGEvent virtual keycodes, never unicode injection
//! - Q2: cliclick shift recipe (plain keycodes, no `CGEventFlags`)
//! - Q3: shift warmup before the first character
//! - Q4: OCR via Swift `ocr_helper` sidecar (Apple Vision)
//! - Q5: scroll via PageUp/PageDown keycodes (not Ctrl+Home)
//! - Q6: LCS line alignment for sent-vs-seen diff

pub mod align;
pub mod diff;
pub mod error;
pub mod event_source;
pub mod fold;
pub mod keymap;
pub mod ocr;
pub mod region;
pub mod scroll;
pub mod sender;
pub mod stitch;
pub mod verify;

pub use diff::{DiffKind, DiffLine, DiffStats};
pub use error::{Result, TyperError};
pub use event_source::{EventSource, RealEventSource};
pub use region::Region;
pub use scroll::{run_scroll_verify, ScrollCfg};
pub use sender::{
    clear_editor, run_send, send_char, send_ctrl_combo, tap_key, warmup_shift, SendCfg,
};
pub use verify::run_verify_diff;
