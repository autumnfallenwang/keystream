//! Integration: corpus keystroke regression fixture.
//!
//! Runs `typer_core::run_send` against the committed PoC sample corpus
//! through a local `RecordingEventSource`, serializes the recorded
//! `(u16, bool)` sequence, and diffs against a committed fixture file.
//!
//! Catches any regression in the keymap, shift recipe (Q2), warmup
//! placement (Q3), or unicode-skip logic at the keystroke level. The
//! live-AVD smoke test (task 47) covers the OCR round-trip.
//!
//! To regenerate the fixture after an intentional change:
//!   KEYSTREAM_UPDATE_FIXTURES=1 cargo test -p typer-core --test sender_regression

use std::cell::RefCell;
use std::fs;
use std::path::PathBuf;

use typer_core::{run_send, EventSource, SendCfg};

// Local RecordingEventSource: the one in event_source.rs is #[cfg(test)]-
// gated and not visible to integration tests. Duplicated here rather than
// promoting out of test-only visibility in production code.
#[derive(Default)]
struct Recording {
    events: RefCell<Vec<(u16, bool)>>,
}

impl EventSource for Recording {
    fn post_key(&self, keycode: u16, down: bool) -> typer_core::Result<()> {
        self.events.borrow_mut().push((keycode, down));
        Ok(())
    }
}

fn serialize(events: &[(u16, bool)]) -> String {
    let mut out = String::with_capacity(events.len() * 7);
    for (k, d) in events {
        out.push_str(&k.to_string());
        out.push_str(if *d { ",down\n" } else { ",up\n" });
    }
    out
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("code_corpus_keystrokes.txt")
}

fn corpus_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("docs")
        .join("poc")
        .join("samples")
        .join("code_corpus.txt")
}

fn fast_cfg_with_warmup() -> SendCfg {
    SendCfg {
        event_pause_ms: 0,
        char_pause_ms: 0,
        jitter_ms: 0,
        mod_hold_ms: 0,
        warmup_shift: true, // Q3: mandatory default; fixture captures it.
    }
}

#[test]
fn corpus_keystroke_sequence_matches_committed_fixture() {
    let corpus = fs::read_to_string(corpus_path()).expect("read corpus");
    let rec = Recording::default();
    run_send(&rec, &corpus, &fast_cfg_with_warmup()).expect("run_send");
    let actual = serialize(&rec.events.borrow());

    let fixture = fixture_path();
    if std::env::var("KEYSTREAM_UPDATE_FIXTURES").is_ok() {
        fs::create_dir_all(fixture.parent().expect("fixture has parent")).expect("mkdir");
        fs::write(&fixture, &actual).expect("write fixture");
        eprintln!("wrote fixture: {}", fixture.display());
        return;
    }

    let expected = fs::read_to_string(&fixture).unwrap_or_else(|_| {
        panic!(
            "fixture missing at {}. Run with KEYSTREAM_UPDATE_FIXTURES=1 \
             cargo test -p typer-core --test sender_regression to generate it.",
            fixture.display()
        )
    });

    if actual == expected {
        return;
    }

    // Mismatch: show the first differing event index so regressions are
    // easy to debug without scrolling through a 2k-line diff.
    let actual_lines: Vec<&str> = actual.lines().collect();
    let expected_lines: Vec<&str> = expected.lines().collect();
    let max_len = actual_lines.len().max(expected_lines.len());
    for i in 0..max_len {
        let a = actual_lines.get(i).copied().unwrap_or("(none)");
        let e = expected_lines.get(i).copied().unwrap_or("(none)");
        if a != e {
            panic!(
                "keystroke sequence drift at event #{i}:\n  actual:   {a}\n  expected: {e}\n\
                 (actual events: {}, expected events: {})",
                actual_lines.len(),
                expected_lines.len()
            );
        }
    }
    unreachable!("actual != expected but no per-line diff found");
}

#[test]
fn corpus_produces_zero_skipped_chars() {
    // Indirect proof: count recorded events, compare to a pure formula
    // derived from the corpus. A skipped char would drop its 2 (or 4)
    // events and break the equality — no log-tailing needed.
    let corpus = fs::read_to_string(corpus_path()).expect("read corpus");
    let rec = Recording::default();
    run_send(&rec, &corpus, &fast_cfg_with_warmup()).expect("run_send");
    let count = rec.events.borrow().len();

    // Expected event count:
    //   warmup: 2 events (shift down + up)
    //   per char:
    //     '\n' → 2 (RETURN down/up via tap_key)
    //     '\r' → 0 (skipped; handled by '\n')
    //     shifted char → 4 (shift down, char down, char up, shift up)
    //     unshifted char → 2 (char down, char up)
    //     unmapped → 0 (skipped — should not occur in the ASCII corpus)
    let shifted_symbols: &[char] = &[
        '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '{', '}', '|', ':', '"', '<',
        '>', '?', '~',
    ];
    let mut expected: u64 = 2; // warmup
    for ch in corpus.chars() {
        expected += match ch {
            '\n' => 2,
            '\r' => 0,
            c if c.is_ascii_uppercase() => 4,
            c if shifted_symbols.contains(&c) => 4,
            c if c.is_ascii() && !c.is_control() => 2,
            _ => 0, // unmapped — flags a regression
        };
    }
    assert_eq!(
        count as u64, expected,
        "event count mismatch — skipped a char or keymap/warmup changed?"
    );
}

#[test]
fn warmup_prepends_exactly_one_shift_pair_and_no_other_difference() {
    // Q3 invariant: `warmup_shift: true` prepends exactly one
    // (KEYCODE_SHIFT, down)/(up) pair to the keystroke sequence and
    // changes nothing else. Removing the warmup (or adding/shifting
    // events around it) would break this structural relationship.
    //
    // Covers rules/testing.md invariant #2 at integration scale; the
    // sender-module unit tests already cover the single-char cases.
    let corpus = fs::read_to_string(corpus_path()).expect("read corpus");

    let run = |warmup: bool| -> Vec<(u16, bool)> {
        let cfg = SendCfg {
            event_pause_ms: 0,
            char_pause_ms: 0,
            jitter_ms: 0,
            mod_hold_ms: 0,
            warmup_shift: warmup,
        };
        let rec = Recording::default();
        run_send(&rec, &corpus, &cfg).expect("run_send");
        let events = rec.events.borrow().clone();
        events
    };

    let with_warmup = run(true);
    let without = run(false);

    // Left shift keycode — matches typer_core::keymap::KEYCODE_SHIFT.
    // Not re-exported from the library crate root; duplicated here
    // rather than pulled in just for this assertion.
    const KEYCODE_SHIFT: u16 = 56;

    assert_eq!(
        with_warmup.len(),
        without.len() + 2,
        "warmup should add exactly 2 events; got {} with vs {} without",
        with_warmup.len(),
        without.len()
    );
    assert_eq!(
        with_warmup[0],
        (KEYCODE_SHIFT, true),
        "first event with warmup must be shift-down"
    );
    assert_eq!(
        with_warmup[1],
        (KEYCODE_SHIFT, false),
        "second event with warmup must be shift-up"
    );
    assert_eq!(
        &with_warmup[2..],
        without.as_slice(),
        "rest of the sequence must be identical — warmup must not perturb anything else"
    );
}
