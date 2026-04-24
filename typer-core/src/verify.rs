//! Single-region verify: OCR the current visible viewport, diff against
//! either the whole sent text (`run_verify_diff`, PoC-style) or the
//! expected chunk's last N lines (`verify_visible`, v1 Q7/Q9 primitive).

use crate::diff::{compute_diff, DiffLine, DiffStats};
use crate::error::Result;
use crate::ocr::capture_ocr_lines;
use crate::region::Region;
use std::path::Path;

/// Capture the calibrated region, OCR it, and diff against `sent`.
/// Returns both aggregate stats and per-line diff records.
pub fn run_verify_diff(
    ocr_bin: &Path,
    region: &Region,
    sent: &str,
) -> Result<(DiffStats, Vec<DiffLine>)> {
    let seen_lines = capture_ocr_lines(ocr_bin, region)?;
    let seen = seen_lines.join("\n");
    Ok(compute_diff(sent, &seen))
}

/// Capture the calibrated region, OCR it, take the last N non-empty
/// OCR lines (N = `expected.len()`), and diff against `expected`.
/// Returns aggregate stats and per-line diff records.
///
/// The "last N non-empty lines" policy assumes the cursor is at or near
/// the bottom of the region after a recent `send_chunk`. This holds
/// when the caller has calibrated a region tall enough that the just-
/// typed chunk doesn't push the cursor below the region. If the cursor
/// has scrolled out of view, verify will return `OcrDrop` entries for
/// the expected lines → chunk-fail → user resolves per Q10. v1 does
/// NOT auto-scroll-to-cursor.
///
/// Early-returns `(DiffStats::default(), vec![])` for empty input
/// without shelling out to OCR.
pub fn verify_visible(
    ocr_bin: &Path,
    region: &Region,
    expected: &[&str],
) -> Result<(DiffStats, Vec<DiffLine>)> {
    if expected.is_empty() {
        return Ok((DiffStats::default(), Vec::new()));
    }
    let seen_lines = capture_ocr_lines(ocr_bin, region)?;
    Ok(diff_against_tail(&seen_lines, expected))
}

/// Pure helper: given fully-OCR'd lines (already trimmed, non-empty per
/// `capture_ocr_lines` / `parse_ocr_json`) and the expected chunk,
/// take the last `expected.len()` seen lines and run `compute_diff`.
/// `pub(crate)` so tests can exercise the slicing without a sidecar.
pub(crate) fn diff_against_tail(
    seen_lines: &[String],
    expected: &[&str],
) -> (DiffStats, Vec<DiffLine>) {
    let start = seen_lines.len().saturating_sub(expected.len());
    let tail = &seen_lines[start..];
    let sent = expected.join("\n");
    let seen = tail.join("\n");
    compute_diff(&sent, &seen)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(lines: &[&str]) -> Vec<String> {
        lines.iter().map(|l| l.to_string()).collect()
    }

    #[test]
    fn verify_visible_empty_expected_returns_default_stats() {
        // Pass a nonexistent sidecar path — verify_visible must early-
        // return without spawning anything when `expected` is empty.
        let bogus = Path::new("/definitely/not/a/real/ocr_bin");
        let region = Region {
            x: 0,
            y: 0,
            w: 100,
            h: 100,
        };
        let (stats, lines) = verify_visible(bogus, &region, &[]).unwrap();
        assert_eq!(stats.char_diffs, 0);
        assert_eq!(stats.total_chars, 0);
        assert!(lines.is_empty());
    }

    #[test]
    fn diff_against_tail_takes_last_n_lines() {
        // Viewport shows 5 lines; we only typed the last 3.
        let seen = s(&["alpha", "bravo", "charlie", "delta", "echo"]);
        let expected = &["charlie", "delta", "echo"];
        let (stats, _) = diff_against_tail(&seen, expected);
        assert_eq!(stats.char_diffs, 0);
        assert!(stats.passes_q9());
    }

    #[test]
    fn diff_against_tail_handles_seen_shorter_than_expected() {
        // If OCR returned fewer lines than expected (e.g. cursor below
        // viewport), tail is the full seen and compute_diff reports the
        // missing ones as OcrDrop.
        let seen = s(&["alpha", "bravo"]);
        let expected = &["alpha", "bravo", "charlie"];
        let (stats, _) = diff_against_tail(&seen, expected);
        assert_eq!(stats.dropped, 1);
        // No char mismatches — the two aligned lines match.
        assert_eq!(stats.char_diffs, 0);
        // But passes_q9 is true here (drops don't fail Q9); the caller
        // is expected to check additional fail conditions (like
        // `stats.dropped > 0`) if they want stricter semantics.
        assert!(stats.passes_q9());
    }

    #[test]
    fn diff_against_tail_detects_single_char_mismatch() {
        let seen = s(&["hallo"]);
        let expected = &["hello"];
        let (stats, _) = diff_against_tail(&seen, expected);
        assert_eq!(stats.char_diffs, 1);
        assert!(!stats.passes_q9());
    }

    #[test]
    fn diff_against_tail_passes_on_exact_match() {
        let seen = s(&["hello", "world"]);
        let expected = &["hello", "world"];
        let (stats, _) = diff_against_tail(&seen, expected);
        assert_eq!(stats.char_diffs, 0);
        assert!(stats.passes_q9());
    }

    #[test]
    fn diff_against_tail_ignores_context_lines_above_tail() {
        // 100 context lines above the 3 we typed — we only compare the
        // last 3. The 100 context lines appear as OcrExtra but char_diffs
        // stays 0.
        let mut seen: Vec<String> = (1..=100).map(|i| format!("ctx{i}")).collect();
        seen.extend(s(&["mine1", "mine2", "mine3"]));
        let expected = &["mine1", "mine2", "mine3"];
        let (stats, _) = diff_against_tail(&seen, expected);
        assert_eq!(stats.char_diffs, 0);
        assert!(stats.passes_q9());
    }
}
