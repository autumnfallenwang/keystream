//! `send_with_chunked_verify` Tauri command: drives the Q7/Q9 chunked
//! send-and-verify loop end-to-end. Events stream out via a Tauri
//! `Channel<SendEvent>` passed in by the frontend; the paired
//! `continue_after_fail` command lets the frontend ack a chunk-fail
//! decision per Q10.
//!
//! Argument validation: `text` is bounded by
//! `crate::validation::MAX_TEXT_BYTES` (1 MiB). `ContinueAction` is
//! validated by serde (only enum variants accepted). See rules/security.md.

use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::sync::mpsc;
use typer_core::config::CHUNK_VERIFY_SETTLE_MS;
use typer_core::region::load_region;
use typer_core::{
    chunk_text, send_chunk, warmup_shift, DiffLine, DiffStats, RealEventSource, SendCfg,
};

use crate::calibrate::region_path;
use crate::send_state::{ContinueAction, SendState};
use crate::validation::validate_text_size;
use crate::verify::capture_and_diff;

/// Events streamed to the frontend during a send. Shape matches the
/// Tauri 2 Channel pattern: a discriminated union with `event` / `data`.
/// Frontend sees camelCase field names.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SendEvent {
    ChunkStart {
        index: usize,
        total: usize,
        lines: Vec<String>,
    },
    ChunkPass {
        index: usize,
    },
    ChunkFail {
        index: usize,
        stats: DiffStats,
        diff: Vec<DiffLine>,
    },
    SendComplete {
        total: usize,
        passed: usize,
        failed: usize,
        skipped: usize,
    },
    SendCancelled {
        at_chunk: usize,
    },
}

/// Drive the Q7/Q9 chunked send-and-verify loop.
///
/// Per chunk: emit `chunkStart` → `send_chunk` → sleep
/// `CHUNK_VERIFY_SETTLE_MS` → capture region → OCR → diff. On pass,
/// emit `chunkPass`. On fail, emit `chunkFail` and await a
/// `ContinueAction` from `continue_after_fail`:
/// - `Skip`: advance to next chunk (chunk counted as failed-acked).
/// - `Stop`: abort; emit `sendCancelled`.
/// - `Retry`: re-run verify on the same chunk (user fixed AVD manually).
#[tauri::command]
pub async fn send_with_chunked_verify(
    app: AppHandle,
    state: State<'_, SendState>,
    text: String,
    on_event: Channel<SendEvent>,
) -> Result<(), String> {
    validate_text_size(&text, "text")?;

    // Reset cancel flag for this run (previous stop_send calls don't
    // poison new sessions).
    state.cancel.store(false, Ordering::SeqCst);

    // Pre-check: region must be calibrated.
    let path = region_path(&app)?;
    let region = load_region(&path).map_err(|e| format!("region not calibrated: {e}"))?;

    // Ack channel for this session. Drop any previous sender (defensive).
    let (ack_tx, mut ack_rx) = mpsc::channel::<ContinueAction>(1);
    *state.ack.lock().await = Some(ack_tx);

    let chunks = chunk_text(&text);
    let total = chunks.len();
    log::info!(
        "send_with_chunked_verify: started chars={} chunks={}",
        text.chars().count(),
        total
    );

    // Warmup runs on the blocking pool so `CGEventSource` (!Send) never
    // crosses an await point. Each chunk's send_chunk call also lives
    // in spawn_blocking — the event source is constructed inside the
    // closure, used, and dropped before returning to async context.
    let cfg = SendCfg::default();
    tokio::task::spawn_blocking({
        let cfg = cfg.clone();
        move || {
            let src = RealEventSource::session_default()?;
            warmup_shift(&src, &cfg)
        }
    })
    .await
    .map_err(|e| format!("warmup join: {e}"))?
    .map_err(|e| format!("warmup: {e}"))?;

    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;

    for (i, chunk) in chunks.iter().enumerate() {
        if state.cancel.load(Ordering::SeqCst) {
            log::info!("send_with_chunked_verify: cancelled before chunk {i}");
            let _ = on_event.send(SendEvent::SendCancelled { at_chunk: i });
            *state.ack.lock().await = None;
            return Ok(());
        }

        let chunk_owned: Vec<String> = chunk.clone();
        let _ = on_event.send(SendEvent::ChunkStart {
            index: i,
            total,
            lines: chunk_owned.clone(),
        });

        // Send this chunk on the blocking pool. The event source is
        // constructed fresh per chunk — cheap (just allocates a CGEventSource
        // handle), and keeps !Send types fully off the async stack.
        let send_result = tokio::task::spawn_blocking({
            let cfg = cfg.clone();
            let chunk_clone = chunk_owned.clone();
            move || -> Result<(), String> {
                let src =
                    RealEventSource::session_default().map_err(|e| format!("event source: {e}"))?;
                let refs: Vec<&str> = chunk_clone.iter().map(String::as_str).collect();
                send_chunk(&src, &refs, &cfg).map_err(|e| format!("send_chunk: {e}"))
            }
        })
        .await
        .map_err(|e| format!("send_chunk join: {e}"))?;
        send_result.map_err(|e| format!("send_chunk[{i}]: {e}"))?;

        tokio::time::sleep(Duration::from_millis(CHUNK_VERIFY_SETTLE_MS)).await;

        let chunk_refs: Vec<&str> = chunk_owned.iter().map(String::as_str).collect();

        // Verify loop: on Retry, re-verify the same chunk.
        loop {
            let (stats, diff) = capture_and_diff(&app, &region, &chunk_refs).await?;
            if stats.passes_q9() {
                passed += 1;
                let _ = on_event.send(SendEvent::ChunkPass { index: i });
                break;
            }

            // FAIL — emit and await ack.
            log::info!(
                "send_with_chunked_verify: chunk={} FAIL char_diffs={}/{}",
                i,
                stats.char_diffs,
                stats.total_chars
            );
            let _ = on_event.send(SendEvent::ChunkFail {
                index: i,
                stats: stats.clone(),
                diff: diff.clone(),
            });

            match ack_rx.recv().await {
                Some(ContinueAction::Skip) => {
                    failed += 1;
                    skipped += 1;
                    break;
                }
                Some(ContinueAction::Stop) => {
                    state.cancel.store(true, Ordering::SeqCst);
                    let _ = on_event.send(SendEvent::SendCancelled { at_chunk: i });
                    *state.ack.lock().await = None;
                    return Ok(());
                }
                Some(ContinueAction::Retry) => {
                    // Re-verify the same chunk — user fixed AVD manually.
                    continue;
                }
                None => {
                    // Ack channel closed unexpectedly (shouldn't happen in
                    // normal flow since we hold the sender via state).
                    state.cancel.store(true, Ordering::SeqCst);
                    let _ = on_event.send(SendEvent::SendCancelled { at_chunk: i });
                    *state.ack.lock().await = None;
                    return Err("ack channel closed".into());
                }
            }
        }
    }

    let _ = on_event.send(SendEvent::SendComplete {
        total,
        passed,
        failed,
        skipped,
    });
    *state.ack.lock().await = None;
    log::info!(
        "send_with_chunked_verify: complete total={total} passed={passed} failed={failed} skipped={skipped}"
    );
    Ok(())
}

/// Frontend ack for the currently-paused chunk-fail state.
#[tauri::command]
pub async fn continue_after_fail(
    state: State<'_, SendState>,
    action: ContinueAction,
) -> Result<(), String> {
    let guard = state.ack.lock().await;
    match guard.as_ref() {
        Some(tx) => tx
            .send(action)
            .await
            .map_err(|e| format!("ack send: {e}"))?,
        None => return Err("no pending send to continue".into()),
    }
    Ok(())
}

// capture_and_diff moved to crate::verify in task 27. Imported above.

/// Cooperative cancel for an in-flight `send_with_chunked_verify`.
/// Flips the shared cancel flag; the orchestrator polls it between
/// chunks and emits `SendCancelled` next time it checks.
///
/// Safe to call any time — if no send is running, flipping the flag
/// is a no-op (the next session resets it at its top).
///
/// Companion to `continue_after_fail(Stop)`: the latter only takes
/// effect while a chunk-fail is paused awaiting an ack; `stop_send`
/// works during normal chunk typing too.
#[tauri::command]
pub fn stop_send(state: State<'_, SendState>) {
    state.cancel.store(true, Ordering::SeqCst);
    log::info!("stop_send: cancel flag set");
}

#[cfg(test)]
mod tests {
    use super::*;
    use typer_core::DiffKind;

    #[test]
    fn send_event_chunk_start_serializes_as_expected_shape() {
        let event = SendEvent::ChunkStart {
            index: 2,
            total: 5,
            lines: vec!["a".into(), "b".into()],
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "chunkStart");
        assert_eq!(json["data"]["index"], 2);
        assert_eq!(json["data"]["total"], 5);
        assert_eq!(json["data"]["lines"][0], "a");
    }

    #[test]
    fn send_event_chunk_fail_carries_stats_and_diff() {
        let event = SendEvent::ChunkFail {
            index: 3,
            stats: DiffStats {
                char_diffs: 1,
                total_chars: 10,
                ..Default::default()
            },
            diff: vec![DiffLine {
                kind: DiffKind::Mismatch,
                index: 0,
                sent: Some("hello".into()),
                seen: Some("hallo".into()),
                char_diffs: 1,
            }],
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "chunkFail");
        assert_eq!(json["data"]["index"], 3);
        assert_eq!(json["data"]["stats"]["charDiffs"], 1);
        assert_eq!(json["data"]["diff"][0]["sent"], "hello");
    }

    #[test]
    fn send_event_send_cancelled_uses_camel_case_field() {
        let event = SendEvent::SendCancelled { at_chunk: 7 };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "sendCancelled");
        // rename_all_fields = "camelCase" → at_chunk becomes atChunk.
        assert_eq!(json["data"]["atChunk"], 7);
    }
}
