//! Integration: Q7/Q9 chunked verify pair.
//!
//! Exercises typer_core::send_chunk + the pure core of verify_visible
//! (parse_ocr_json + tail-slice + compute_diff) against synthetic
//! 10-line fixtures. Confirms:
//!   - send_chunk produces the expected keystroke sequence for a
//!     realistic 10-line chunk, with no warmup (Q7 contract: caller
//!     warms up once before the first chunk, not per-chunk).
//!   - Clean OCR JSON passes Q9 (char_diffs == 0).
//!   - One-char-corrupted OCR JSON fails Q9 with char_diffs == 1.
//!
//! The full verify_visible function shells out to screencapture + the
//! Swift ocr_helper sidecar, which integration tests can't invoke
//! deterministically. We replicate its internal pipeline here to get
//! coverage of parse_ocr_json (security-critical typed serde parse)
//! + compute_diff end-to-end.

use std::cell::RefCell;
use typer_core::{
    diff::compute_diff, ocr::parse_ocr_json, send_chunk, EventSource, Result as TyperResult,
    SendCfg,
};

/// Local test-double event source. The one in src/event_source.rs is
/// #[cfg(test)]-gated and not visible to integration tests.
#[derive(Default)]
struct Recording {
    events: RefCell<Vec<(u16, bool)>>,
}
impl EventSource for Recording {
    fn post_key(&self, keycode: u16, down: bool) -> TyperResult<()> {
        self.events.borrow_mut().push((keycode, down));
        Ok(())
    }
}

/// A synthetic 10-line code-like chunk. All chars are in the US-ANSI
/// keymap; every line is under 80 chars (Q8). Mix of shifted +
/// unshifted chars + newlines (via separate lines).
const CHUNK: [&str; 10] = [
    "const x = 1;",
    "const y = 2;",
    "const z = x + y;",
    "function add(a, b) {",
    "return a + b;",
    "}",
    "const result = add(x, y);",
    "console.log(result);",
    "const items = [1, 2, 3];",
    "items.forEach(i => console.log(i));",
];

fn fast_cfg() -> SendCfg {
    SendCfg {
        event_pause_ms: 0,
        char_pause_ms: 0,
        jitter_ms: 0,
        mod_hold_ms: 0,
        warmup_shift: false, // Q7: send_chunk never warms up.
    }
}

fn make_ocr_json(lines: &[&str]) -> String {
    let mut json = String::from("{\"lines\":[");
    for (i, l) in lines.iter().enumerate() {
        if i > 0 {
            json.push(',');
        }
        // Escape backslashes and double quotes in the line content so
        // the resulting JSON is well-formed for any ASCII input.
        let escaped = l.replace('\\', "\\\\").replace('"', "\\\"");
        json.push_str(&format!("{{\"text\":\"{escaped}\"}}"));
    }
    json.push_str("]}");
    json
}

#[test]
fn send_chunk_types_ten_lines_with_expected_event_count() {
    let rec = Recording::default();
    send_chunk(&rec, &CHUNK, &fast_cfg()).expect("send_chunk");
    let count = rec.events.borrow().len();

    // Expected per-char contribution:
    //   shifted char (uppercase or symbol like `!@#` etc.) → 4 events
    //   unshifted printable char → 2 events
    //   other → 0 (should not occur in this chunk)
    // Plus 2 events per line (RETURN down/up via tap_key).
    // No warmup (Q7: caller's job).
    let shifted_symbols: &[char] = &[
        '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '{', '}', '|', ':', '"', '<',
        '>', '?', '~',
    ];
    let mut expected: u64 = 0;
    for line in &CHUNK {
        for c in line.chars() {
            expected += match c {
                c if c.is_ascii_uppercase() => 4,
                c if shifted_symbols.contains(&c) => 4,
                c if c.is_ascii() && !c.is_control() => 2,
                _ => 0,
            };
        }
        expected += 2; // trailing newline per line
    }

    assert_eq!(count as u64, expected, "keystroke event count mismatch");
}

#[test]
fn verify_pair_passes_on_clean_ocr() {
    let json = make_ocr_json(&CHUNK);
    let seen = parse_ocr_json(&json).expect("parse clean OCR JSON");
    assert_eq!(seen.len(), 10, "parse returned 10 non-blank lines");

    // Replicate verify_visible's tail-slice + diff logic. The full
    // function shells out to screencapture + sidecar; here we feed the
    // parsed OCR lines directly.
    let tail = &seen[seen.len().saturating_sub(CHUNK.len())..];
    let sent = CHUNK.join("\n");
    let seen_str = tail.join("\n");
    let (stats, _lines) = compute_diff(&sent, &seen_str);

    assert!(stats.passes_q9(), "clean OCR must pass Q9");
    assert_eq!(stats.char_diffs, 0);
}

#[test]
fn verify_pair_fails_on_one_char_corruption() {
    // Corrupt one char: "const y = 2;" → "const y = 3;". Digit '3' has
    // no fold-table class that overlaps digit '2' (only 0/O/o and
    // 1/l/I/i are digit-lookalike classes), so compute_diff reports
    // exactly one char_diff after the fold pass.
    let mut corrupted: Vec<&str> = CHUNK.to_vec();
    corrupted[1] = "const y = 3;";
    let json = make_ocr_json(&corrupted);
    let seen = parse_ocr_json(&json).expect("parse corrupted OCR JSON");
    assert_eq!(seen.len(), 10);

    let tail = &seen[seen.len().saturating_sub(CHUNK.len())..];
    let sent = CHUNK.join("\n");
    let seen_str = tail.join("\n");
    let (stats, _lines) = compute_diff(&sent, &seen_str);

    assert!(!stats.passes_q9(), "one-char corruption must fail Q9");
    assert_eq!(stats.char_diffs, 1, "expected exactly one char diff");
}
