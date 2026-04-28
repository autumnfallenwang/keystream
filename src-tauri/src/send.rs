//! v2 send surface (Q14): linear `run_send`, with `pause_send` and
//! `stop_send` flipping a shared `SendControlFlag`.
//!
//! Emits `SendEvent` variants over a Tauri `Channel<SendEvent>` passed
//! in by the frontend. Resume is just another `run_send` call with
//! `start_offset = position` from the previous SendPaused event.
//!
//! Argument validation: `text` is bounded by
//! `crate::validation::MAX_TEXT_BYTES` (1 MiB). See rules/security.md.

use tauri::ipc::Channel;
use tauri::State;
use typer_core::{ExitReason, RealEventSource, SendCfg};

use crate::send_state::SendState;
use crate::settings::SettingsCfg;
use crate::validation::validate_text_size;

/// Events streamed to the frontend during a send. Tauri 2 Channel
/// pattern: discriminated union with `event` / `data`. Frontend sees
/// camelCase.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SendEvent {
    /// Final outcome — all chars typed.
    SendComplete {
        chars_typed: usize,
        skipped: u64,
        duration_ms: u64,
    },
    /// `pause_send` was observed mid-loop. `position` is the next char
    /// index that *would* be typed; resume by calling `run_send` with
    /// `start_offset = position`.
    SendPaused {
        position: usize,
        chars_typed: usize,
        duration_ms: u64,
    },
    /// `stop_send` was observed mid-loop. Frontend resets to position 0;
    /// `position` is reported only for telemetry / logging.
    SendStopped {
        position: usize,
        chars_typed: usize,
        duration_ms: u64,
    },
}

/// Drive the v2 linear send loop. Returns when the underlying
/// `typer_core::run_send` returns (Completed / Paused / Stopped); the
/// final outcome is also emitted as a `SendEvent` so the frontend
/// doesn't need to await both the channel and the promise.
#[tauri::command]
pub async fn run_send(
    state: State<'_, SendState>,
    text: String,
    cfg: SettingsCfg,
    start_offset: usize,
    on_event: Channel<SendEvent>,
) -> Result<(), String> {
    validate_text_size(&text, "text")?;

    // Reset the control flag at the top of every run. The flag is also
    // self-resetting on exit inside typer_core::run_send, but doing it
    // here too keeps re-runs clean even if the previous call was
    // cancelled before reaching that reset.
    state.control.set_running();

    let send_cfg = SendCfg {
        event_pause_ms: cfg.event_pause_ms,
        mod_hold_ms: cfg.mod_hold_ms,
        warmup_shift: cfg.warmup_shift,
    };

    let total_chars = text.chars().count();
    log::info!(
        "run_send: started chars={} start_offset={} event_pause_ms={} mod_hold_ms={} warmup={}",
        total_chars,
        start_offset,
        cfg.event_pause_ms,
        cfg.mod_hold_ms,
        cfg.warmup_shift
    );

    // SendControlFlag is Clone (shares Arc inside). The clone goes to
    // the worker; pause_send / stop_send flip via the State handle.
    let control = state.control.clone();

    let outcome =
        tokio::task::spawn_blocking(move || -> Result<typer_core::SendOutcome, String> {
            let src =
                RealEventSource::session_default().map_err(|e| format!("event source: {e}"))?;
            typer_core::run_send(&src, &text, &send_cfg, &control, start_offset)
                .map_err(|e| format!("run_send: {e}"))
        })
        .await
        .map_err(|e| format!("run_send join: {e}"))??;

    let event = match outcome.reason {
        ExitReason::Completed => SendEvent::SendComplete {
            chars_typed: outcome.chars_typed,
            skipped: outcome.skipped,
            duration_ms: outcome.duration_ms,
        },
        ExitReason::Paused { position } => SendEvent::SendPaused {
            position,
            chars_typed: outcome.chars_typed,
            duration_ms: outcome.duration_ms,
        },
        ExitReason::Stopped { position } => SendEvent::SendStopped {
            position,
            chars_typed: outcome.chars_typed,
            duration_ms: outcome.duration_ms,
        },
    };
    let _ = on_event.send(event);
    log::info!(
        "run_send: complete reason={:?} chars_typed={} skipped={} duration_ms={}",
        outcome.reason,
        outcome.chars_typed,
        outcome.skipped,
        outcome.duration_ms
    );
    Ok(())
}

/// Request the in-flight send to pause at the next char boundary.
/// Idempotent; safe to call when no send is running (just sets a flag).
#[tauri::command]
pub fn pause_send(state: State<'_, SendState>) {
    state.control.request_pause();
    log::info!("pause_send: pause flag set");
}

/// Request the in-flight send to stop at the next char boundary.
/// Frontend resets to position 0 — next Send starts from the beginning.
/// Idempotent; safe to call any time.
#[tauri::command]
pub fn stop_send(state: State<'_, SendState>) {
    state.control.request_stop();
    log::info!("stop_send: stop flag set");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_event_send_complete_serializes_camel_case() {
        let event = SendEvent::SendComplete {
            chars_typed: 100,
            skipped: 2,
            duration_ms: 4_321,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "sendComplete");
        assert_eq!(json["data"]["charsTyped"], 100);
        assert_eq!(json["data"]["skipped"], 2);
        assert_eq!(json["data"]["durationMs"], 4_321);
    }

    #[test]
    fn send_event_send_paused_carries_position() {
        let event = SendEvent::SendPaused {
            position: 42,
            chars_typed: 40,
            duration_ms: 1_000,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "sendPaused");
        assert_eq!(json["data"]["position"], 42);
        assert_eq!(json["data"]["charsTyped"], 40);
    }

    #[test]
    fn send_event_send_stopped_carries_position() {
        let event = SendEvent::SendStopped {
            position: 17,
            chars_typed: 15,
            duration_ms: 500,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "sendStopped");
        assert_eq!(json["data"]["position"], 17);
    }

    #[test]
    fn send_state_default_starts_running() {
        let state = SendState::default();
        assert_eq!(state.control.read(), typer_core::SendControl::Running);
    }
}
