//! Multi-viewport scroll verify. Scrolls the target editor to the top
//! via PageUp × 40 (Q5), PageDowns through the file capturing per
//! viewport, stitches chunks by tail/head overlap, then diffs against
//! the sent text.

use crate::diff::{compute_diff, DiffLine, DiffStats};
use crate::error::Result;
use crate::event_source::EventSource;
use crate::keymap::{KEYCODE_PAGE_DOWN, KEYCODE_PAGE_UP};
use crate::ocr::capture_ocr_lines;
use crate::region::Region;
use crate::sender::SendCfg;
use crate::stitch::{chunks_equivalent, stitch_chunks};
use std::path::Path;
use std::thread;
use std::time::Duration;

/// Safety cap: maximum PageDown steps to attempt.
pub const DEFAULT_SCROLL_MAX_PAGES: u32 = 30;
/// Wait after each scroll keystroke before screenshotting.
pub const DEFAULT_SCROLL_SETTLE_MS: u64 = 250;

pub struct ScrollCfg {
    pub max_pages: u32,
    pub settle_ms: u64,
}

impl Default for ScrollCfg {
    fn default() -> Self {
        Self {
            max_pages: DEFAULT_SCROLL_MAX_PAGES,
            settle_ms: DEFAULT_SCROLL_SETTLE_MS,
        }
    }
}

/// Scroll-and-verify: PageUp to top, OCR each viewport while paging down,
/// stitch the chunks, diff against `sent`. Returns aggregate stats and
/// per-line diff records.
pub fn run_scroll_verify(
    src: &dyn EventSource,
    ocr_bin: &Path,
    region: &Region,
    sent: &str,
    send_cfg: &SendCfg,
    scroll_cfg: &ScrollCfg,
) -> Result<(DiffStats, Vec<DiffLine>)> {
    // Q5: PageUp × 40 brute-forces scroll-to-top in any viewport.
    log::info!("scroll_verify: PageUp x40 -> top");
    for _ in 0..40 {
        src.post_key(KEYCODE_PAGE_UP, true)?;
        thread::sleep(Duration::from_millis(send_cfg.event_pause_ms));
        src.post_key(KEYCODE_PAGE_UP, false)?;
        thread::sleep(Duration::from_millis(30));
    }
    thread::sleep(Duration::from_millis(scroll_cfg.settle_ms));

    let mut chunks: Vec<Vec<String>> = Vec::new();
    let first = capture_ocr_lines(ocr_bin, region)?;
    chunks.push(first);

    for step in 1..=scroll_cfg.max_pages {
        src.post_key(KEYCODE_PAGE_DOWN, true)?;
        thread::sleep(Duration::from_millis(send_cfg.event_pause_ms));
        src.post_key(KEYCODE_PAGE_DOWN, false)?;
        thread::sleep(Duration::from_millis(scroll_cfg.settle_ms));

        let lines = capture_ocr_lines(ocr_bin, region)?;

        // Stop if this chunk is ~identical to the previous one (viewport
        // didn't change → hit bottom).
        let prev = chunks.last().expect("chunks always has first entry");
        if chunks_equivalent(prev, &lines) {
            log::info!(
                "scroll_verify: viewport stopped moving at step={} (reached bottom)",
                step
            );
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
    Ok(compute_diff(sent, &seen))
}
