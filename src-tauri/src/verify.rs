//! `verify_visible` (single-region) and `scroll_verify` (multi-viewport
//! PoC debug mode) Tauri commands. Both expose library verify logic to
//! the frontend over IPC.
//!
//! Also hosts the shared `capture_and_diff` helper used by
//! `send_with_chunked_verify` (task 26). Centralising the helper here
//! keeps one copy of the OCR pipeline (screencapture → sidecar → parse
//! → diff).

use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::task::spawn_blocking;
use typer_core::config::{
    PAGE_UP_INTER_MS, SCROLL_MAX_PAGES, SCROLL_SETTLE_MS, SCROLL_TO_TOP_PAGE_UPS,
};
use typer_core::diff::compute_diff;
use typer_core::keymap::{KEYCODE_PAGE_DOWN, KEYCODE_PAGE_UP};
use typer_core::region::{load_region, Region};
use typer_core::stitch::{chunks_equivalent, stitch_chunks};
use typer_core::{diff_against_tail, DiffLine, DiffStats, EventSource, RealEventSource, SendCfg};

use crate::calibrate::region_path;

/// Returned by `verify_visible` and `scroll_verify`. Frontend sees
/// `{ stats: DiffStats, diff: DiffLine[] }` (camelCase on nested
/// fields is handled by `DiffStats` / `DiffLine`'s own
/// `rename_all = "camelCase"` attrs from task 26).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub stats: DiffStats,
    pub diff: Vec<DiffLine>,
}

/// Internal OCR capture: screencapture → sidecar → parse. Used by both
/// the single-region `verify_visible` path and `scroll_verify`'s
/// per-viewport capture loop.
pub(crate) async fn capture_ocr_lines_via_plugin(
    app: &AppHandle,
    region: &Region,
) -> Result<Vec<String>, String> {
    let png =
        typer_core::ocr::capture_region_png(region).map_err(|e| format!("screencapture: {e}"))?;

    let png_str = png.to_str().ok_or("non-utf8 PNG path")?;
    let sidecar = app
        .shell()
        .sidecar("ocr_helper")
        .map_err(|e| format!("sidecar init: {e}"))?
        .arg(png_str);
    let output = sidecar
        .output()
        .await
        .map_err(|e| format!("sidecar spawn: {e}"))?;
    if !output.status.success() {
        return Err(format!("ocr_helper failed: {:?}", output.status));
    }

    let json = String::from_utf8_lossy(&output.stdout);
    typer_core::ocr::parse_ocr_json(&json).map_err(|e| format!("parse OCR: {e}"))
}

/// OCR the calibrated region, tail-diff against `expected`. Used by
/// `send_with_chunked_verify` (task 26) and `verify_visible` (this
/// task). Mirrors `typer_core::verify_visible`'s pure core but uses
/// `tauri-plugin-shell` for the OCR sidecar instead of
/// `std::process::Command`.
pub(crate) async fn capture_and_diff(
    app: &AppHandle,
    region: &Region,
    expected: &[&str],
) -> Result<(DiffStats, Vec<DiffLine>), String> {
    if expected.is_empty() {
        return Ok((DiffStats::default(), Vec::new()));
    }
    let seen_lines = capture_ocr_lines_via_plugin(app, region).await?;
    Ok(diff_against_tail(&seen_lines, expected))
}

/// Capture the calibrated region, tail-diff against the expected
/// chunk, return stats + per-line diff records. For empty `expected`,
/// returns a trivial pass (matches library's `verify_visible` behavior).
#[tauri::command]
pub async fn verify_visible(app: AppHandle, expected: Vec<String>) -> Result<VerifyResult, String> {
    let path = region_path(&app)?;
    let region = load_region(&path).map_err(|e| format!("region not calibrated: {e}"))?;

    let refs: Vec<&str> = expected.iter().map(String::as_str).collect();
    let (stats, diff) = capture_and_diff(&app, &region, &refs).await?;
    log::info!(
        "verify_visible: expected={} char_diffs={} passes_q9={}",
        expected.len(),
        stats.char_diffs,
        stats.passes_q9()
    );
    Ok(VerifyResult { stats, diff })
}

/// Full-file PoC mode (debug). Scrolls the target editor to the top
/// via PageUp × N (Q5), PageDowns through OCRing each viewport, stops
/// when the viewport stalls, stitches chunks by tail/head overlap,
/// and diffs against `sent`. Reimplements
/// `typer_core::run_scroll_verify`'s orchestration inline so the OCR
/// sidecar can be spawned via `tauri-plugin-shell` instead of
/// `std::process::Command`. Keep both in sync if either changes.
#[tauri::command]
pub async fn scroll_verify(app: AppHandle, sent: String) -> Result<VerifyResult, String> {
    let path = region_path(&app)?;
    let region = load_region(&path).map_err(|e| format!("region not calibrated: {e}"))?;

    let send_cfg = SendCfg::default();

    // Scroll-to-top. `RealEventSource` is !Send so the keystroke batch
    // runs on the blocking pool; future returns to async for OCR.
    log::info!("scroll_verify: PageUp x{} -> top", SCROLL_TO_TOP_PAGE_UPS);
    let cfg_pageup = send_cfg.clone();
    spawn_blocking(move || -> Result<(), String> {
        let src = RealEventSource::session_default().map_err(|e| format!("event source: {e}"))?;
        for _ in 0..SCROLL_TO_TOP_PAGE_UPS {
            src.post_key(KEYCODE_PAGE_UP, true)
                .map_err(|e| format!("page up: {e}"))?;
            std::thread::sleep(Duration::from_millis(cfg_pageup.event_pause_ms));
            src.post_key(KEYCODE_PAGE_UP, false)
                .map_err(|e| format!("page up: {e}"))?;
            std::thread::sleep(Duration::from_millis(PAGE_UP_INTER_MS));
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("page-up join: {e}"))??;

    tokio::time::sleep(Duration::from_millis(SCROLL_SETTLE_MS)).await;

    // First viewport capture.
    let mut chunks: Vec<Vec<String>> = Vec::new();
    let first = capture_ocr_lines_via_plugin(&app, &region).await?;
    chunks.push(first);

    // PageDown loop: scroll one viewport at a time, OCR, stop when the
    // viewport stops moving (chunks_equivalent).
    for step in 1..=SCROLL_MAX_PAGES {
        let cfg_pagedown = send_cfg.clone();
        spawn_blocking(move || -> Result<(), String> {
            let src =
                RealEventSource::session_default().map_err(|e| format!("event source: {e}"))?;
            src.post_key(KEYCODE_PAGE_DOWN, true)
                .map_err(|e| format!("page down: {e}"))?;
            std::thread::sleep(Duration::from_millis(cfg_pagedown.event_pause_ms));
            src.post_key(KEYCODE_PAGE_DOWN, false)
                .map_err(|e| format!("page down: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("page-down join: {e}"))??;

        tokio::time::sleep(Duration::from_millis(SCROLL_SETTLE_MS)).await;

        let lines = capture_ocr_lines_via_plugin(&app, &region).await?;
        let prev = chunks.last().expect("chunks always has first entry");
        if chunks_equivalent(prev, &lines) {
            log::info!("scroll_verify: viewport stopped moving at step={step} (reached bottom)");
            break;
        }
        chunks.push(lines);
    }

    let stitched = stitch_chunks(&chunks);
    log::info!(
        "scroll_verify: chunks={} stitched_lines={}",
        chunks.len(),
        stitched.len()
    );
    let seen = stitched.join("\n");
    let (stats, diff) = compute_diff(&sent, &seen);
    Ok(VerifyResult { stats, diff })
}

#[cfg(test)]
mod tests {
    use super::*;
    use typer_core::DiffKind;

    #[test]
    fn verify_result_serializes_with_camel_case_fields() {
        let r = VerifyResult {
            stats: DiffStats {
                char_diffs: 2,
                total_chars: 10,
                ..Default::default()
            },
            diff: vec![DiffLine {
                kind: DiffKind::Match,
                index: 0,
                sent: Some("hi".into()),
                seen: Some("hi".into()),
                char_diffs: 0,
            }],
        };
        let json = serde_json::to_value(&r).unwrap();
        // Nested structs already have rename_all=camelCase from task 26.
        assert_eq!(json["stats"]["charDiffs"], 2);
        assert_eq!(json["stats"]["totalChars"], 10);
        assert_eq!(json["diff"][0]["charDiffs"], 0);
        assert_eq!(json["diff"][0]["kind"], "Match");
    }
}
