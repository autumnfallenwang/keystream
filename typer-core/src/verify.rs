//! Single-region verify: OCR the current visible viewport, diff against
//! the sent text. No scrolling. Equivalent to the PoC's `run_verify_diff`.

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
