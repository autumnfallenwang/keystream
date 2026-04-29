//! Named numeric constants for typer-core. All wait durations, counts,
//! and tunable defaults live here per `.claude/rules/conventions.md`
//! "Keystroke timing": no magic numbers anywhere else in the library.
//!
//! v2 hardcodes these. Phase v2-5 surfaces a settings UI; the Tauri
//! handler will read user-tunable values from `<app_data_dir>/settings.json`
//! and pass them through `SendCfg`. The constant names here become the
//! defaults the settings layer falls back to.

// --- Countdown before send ---

/// Seconds the countdown overlay counts down (Q3 shift warmup fires
/// during this window, Q14 fires this on every Send and Resume).
pub const COUNTDOWN_SECS: u64 = 3;

// --- Keystroke timing (Q2 cliclick recipe) ---

/// Sleep after each key down/up event. Matches cliclick's 10ms.
/// poc2 confirmed: RDP floor is 7ms, local Mac floor is 5ms — 10ms
/// keeps a 30% margin over the RDP floor. See `docs/lessons.md` (poc2 entries).
pub const EVENT_PAUSE_MS: u64 = 10;

/// Hold time between shift down/up and the char event (Q2 recipe).
pub const MOD_HOLD_MS: u64 = 10;

/// Minimum floor for `mod_hold_ms` during warmup (Q3). Warmup uses
/// `cfg.mod_hold_ms.max(MOD_HOLD_MIN_MS)` so a caller that zeroes out
/// mod_hold_ms for non-warmup purposes still gets a real shift hold
/// during warmup.
pub const MOD_HOLD_MIN_MS: u64 = 10;

/// Settle time after the warmup shift release, before the real send
/// starts. Gives the VM modifier-state tracker time to reset before
/// the first character.
pub const WARMUP_SETTLE_MS: u64 = 50;

// --- Default SendCfg values (Q3) ---

/// Whether `SendCfg::default()` enables shift warmup. Q3 mandates
/// this stays true.
pub const DEFAULT_WARMUP_SHIFT: bool = true;

// --- clear_editor timing ---

/// Settle after Ctrl-up and after Backspace in `clear_editor`. Larger
/// than `EVENT_PAUSE_MS` because the editor takes time to process the
/// full select-all-and-delete sequence.
pub const CLEAR_EDITOR_SETTLE_MS: u64 = 150;
