//! `typer` — CLI harness for typer-core.
//!
//! Thin wrapper over the library. Lets you smoke-test the send/verify
//! pipeline against a real local editor or remote VM without the Tauri
//! shell. Also hosts the historical `scroll-test` probe that led to Q5
//! (PageUp/PageDown chosen over Ctrl+Home).
//!
//! Run via `cargo run -p typer-core --bin typer -- <args>`.

use clap::{Parser, Subcommand};
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use log::{error, info};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, ExitCode};
use std::thread;
use std::time::Duration;
use typer_core::config::{CHUNK_VERIFY_SETTLE_MS, COUNTDOWN_SECS};
use typer_core::region::{legacy_config_path, load_region, save_region, Region};
use typer_core::{
    chunk_text, clear_editor, run_scroll_verify, run_send, run_verify_diff, send_chunk,
    verify_visible, warmup_shift, DiffKind, DiffLine, DiffStats, RealEventSource, Result,
    ScrollCfg, SendCfg, TyperError,
};

#[derive(Parser)]
#[command(name = "typer", about = "CLI harness for typer-core (Keystream)")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Launch region_picker to select the target editor region; save to
    /// ~/.typer/config.txt.
    Calibrate {
        #[arg(long)]
        picker: PathBuf,
    },

    /// Historical: fire four scroll methods with pauses so the operator
    /// can watch which reach the target. The decision that came from
    /// this probe is locked as Q5 (plain PageUp/PageDown work;
    /// Ctrl+Home and Fn-flagged variants don't reach AVD).
    ScrollTest {
        #[arg(long, default_value_t = 3)]
        countdown: u64,
        #[arg(long, default_value_t = 2500)]
        pause_ms: u64,
    },

    /// Capture the calibrated region, OCR it, print each line.
    Verify {
        #[arg(long)]
        ocr: PathBuf,
    },

    /// Send a text buffer keystroke-by-keystroke, with optional post-
    /// send verify. Preserves PoC behavior for whole-file regression
    /// runs.
    Send {
        #[arg(long, conflicts_with = "file")]
        text: Option<String>,
        #[arg(long)]
        file: Option<PathBuf>,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,

        /// After typing, capture the region and diff against sent text.
        #[arg(long, default_value_t = false)]
        verify: bool,

        /// After typing, scroll to top and PageDown through capturing,
        /// stitch chunks, diff against sent text. Use for multi-
        /// viewport files.
        #[arg(long, default_value_t = false)]
        scroll_verify: bool,

        /// Path to ocr_helper; required when --verify or --scroll-verify.
        #[arg(long)]
        ocr: Option<PathBuf>,

        /// Repeat the send (and verify, if enabled) this many times.
        /// Between runs, Ctrl+A then Backspace clears the editor.
        #[arg(long, default_value_t = 1)]
        runs: u32,

        /// Wait between runs.
        #[arg(long, default_value_t = 1500)]
        run_gap_ms: u64,
    },

    /// Smoke the Q7/Q9 chunked loop: chunk_text → send_chunk →
    /// verify_visible → pass/fail per chunk. Stops on first fail
    /// (Q10 v1 behavior: pause and surface).
    SendChunk {
        #[arg(long)]
        file: PathBuf,
        #[arg(long)]
        ocr: PathBuf,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,

        /// Milliseconds to sleep between send_chunk and verify_visible.
        #[arg(long, default_value_t = CHUNK_VERIFY_SETTLE_MS)]
        settle_ms: u64,
    },
}

fn main() -> ExitCode {
    env_logger::Builder::new()
        .filter_level(log::LevelFilter::Info)
        .parse_default_env()
        .init();

    let cli = Cli::parse();
    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            error!("{e}");
            ExitCode::from(1)
        }
    }
}

fn run(cli: Cli) -> Result<()> {
    match cli.cmd {
        Cmd::Calibrate { picker } => do_calibrate(&picker),
        Cmd::ScrollTest {
            countdown,
            pause_ms,
        } => {
            do_scroll_test(countdown, pause_ms);
            Ok(())
        }
        Cmd::Verify { ocr } => do_verify(&ocr),
        Cmd::Send {
            text,
            file,
            countdown,
            verify,
            scroll_verify,
            ocr,
            runs,
            run_gap_ms,
        } => do_send(SendArgs {
            text,
            file,
            countdown,
            verify,
            scroll_verify,
            ocr,
            runs,
            run_gap_ms,
        }),
        Cmd::SendChunk {
            file,
            ocr,
            countdown,
            settle_ms,
        } => do_send_chunk(&file, &ocr, countdown, settle_ms),
    }
}

// ---------- subcommand implementations ----------

fn do_calibrate(picker: &std::path::Path) -> Result<()> {
    println!("Drag a rectangle over the target editor area. Press Esc to cancel.");
    let out = Command::new(picker)
        .output()
        .map_err(|e| TyperError::CommandSpawn {
            cmd: picker.display().to_string(),
            reason: e.to_string(),
        })?;
    if !out.status.success() {
        return Err(TyperError::CommandNonZero {
            cmd: picker.display().to_string(),
            status: out.status.code().map_or("signal".into(), |c| c.to_string()),
        });
    }
    let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let parts: Vec<i32> = line
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();
    if parts.len() != 4 {
        return Err(TyperError::RegionMalformed {
            path: "(picker stdout)".to_string(),
            reason: format!("expected 4 integers, got {line:?}"),
        });
    }
    let r = Region {
        x: parts[0],
        y: parts[1],
        w: parts[2],
        h: parts[3],
    };
    let path = legacy_config_path()?;
    save_region(&r, &path)?;
    println!(
        "saved region: x={} y={} w={} h={} -> {}",
        r.x,
        r.y,
        r.w,
        r.h,
        path.display()
    );
    Ok(())
}

fn do_verify(ocr: &std::path::Path) -> Result<()> {
    let region = load_region(&legacy_config_path()?)?;
    let lines = typer_core::ocr::capture_ocr_lines(ocr, &region)?;
    for (i, l) in lines.iter().enumerate() {
        println!("{i:3}: {l}");
    }
    Ok(())
}

struct SendArgs {
    text: Option<String>,
    file: Option<PathBuf>,
    countdown: u64,
    verify: bool,
    scroll_verify: bool,
    ocr: Option<PathBuf>,
    runs: u32,
    run_gap_ms: u64,
}

fn do_send(args: SendArgs) -> Result<()> {
    let SendArgs {
        text,
        file,
        countdown,
        verify,
        scroll_verify,
        ocr,
        runs,
        run_gap_ms,
    } = args;
    let content = match (text, file) {
        (Some(t), _) => t,
        (_, Some(f)) => fs::read_to_string(&f).map_err(|e| TyperError::Io {
            path: f.display().to_string(),
            source: e,
        })?,
        (None, None) => {
            return Err(TyperError::RegionMalformed {
                path: "(args)".to_string(),
                reason: "--text or --file required".to_string(),
            })
        }
    };

    if (verify || scroll_verify) && ocr.is_none() {
        return Err(TyperError::RegionMalformed {
            path: "(args)".to_string(),
            reason: "--ocr <path> required when --verify or --scroll-verify is set".to_string(),
        });
    }

    let cfg = SendCfg::default();
    let scroll_cfg = ScrollCfg::default();
    let src = RealEventSource::new(
        CGEventSourceStateID::CombinedSessionState,
        CGEventTapLocation::Session,
    )?;

    let mut aggregate: Vec<DiffStats> = Vec::new();
    for run in 1..=runs {
        if runs > 1 {
            println!("\n########## run {run}/{runs} ##########");
        }
        if run == 1 {
            do_countdown(countdown);
        }
        run_send(&src, &content, &cfg)?;

        if scroll_verify {
            thread::sleep(Duration::from_millis(CHUNK_VERIFY_SETTLE_MS));
            let region = load_region(&legacy_config_path()?)?;
            let ocr_bin = ocr.as_ref().expect("checked above");
            let (stats, diff_lines) =
                run_scroll_verify(&src, ocr_bin, &region, &content, &cfg, &scroll_cfg)?;
            print_diff_lines(&stats, &diff_lines);
            aggregate.push(stats);
        } else if verify {
            thread::sleep(Duration::from_millis(CHUNK_VERIFY_SETTLE_MS));
            let region = load_region(&legacy_config_path()?)?;
            let ocr_bin = ocr.as_ref().expect("checked above");
            let (stats, diff_lines) = run_verify_diff(ocr_bin, &region, &content)?;
            print_diff_lines(&stats, &diff_lines);
            aggregate.push(stats);
        }

        if run < runs {
            clear_editor(&src, &cfg)?;
            thread::sleep(Duration::from_millis(run_gap_ms));
        }
    }

    if aggregate.len() > 1 {
        print_aggregate(&aggregate);
    }
    Ok(())
}

fn do_send_chunk(
    file: &std::path::Path,
    ocr: &std::path::Path,
    countdown: u64,
    settle_ms: u64,
) -> Result<()> {
    let content = fs::read_to_string(file).map_err(|e| TyperError::Io {
        path: file.display().to_string(),
        source: e,
    })?;
    let chunks = chunk_text(&content);
    if chunks.is_empty() {
        println!("(empty input)");
        return Ok(());
    }

    let region = load_region(&legacy_config_path()?)?;
    let cfg = SendCfg::default();
    let src = RealEventSource::new(
        CGEventSourceStateID::CombinedSessionState,
        CGEventTapLocation::Session,
    )?;

    do_countdown(countdown);
    warmup_shift(&src, &cfg)?;

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_refs: Vec<&str> = chunk.iter().map(String::as_str).collect();
        let chars: usize = chunk_refs.iter().map(|l| l.chars().count()).sum();
        println!(
            "chunk {}/{}: lines={} chars={}",
            i + 1,
            chunks.len(),
            chunk_refs.len(),
            chars
        );

        send_chunk(&src, &chunk_refs, &cfg)?;
        thread::sleep(Duration::from_millis(settle_ms));

        let (stats, diff_lines) = verify_visible(ocr, &region, &chunk_refs)?;
        if stats.passes_q9() {
            println!("  PASS");
        } else {
            println!(
                "  FAIL: char_diffs={}/{}",
                stats.char_diffs, stats.total_chars
            );
            print_diff_lines(&stats, &diff_lines);
            println!("stopping at chunk {} (Q10: pause and surface)", i + 1);
            return Ok(());
        }
    }
    println!("all chunks passed ({}).", chunks.len());
    Ok(())
}

// ---------- scroll-test (historical probe — Q5 source) ----------

fn do_scroll_test(countdown: u64, pause_ms: u64) {
    do_countdown(countdown);

    // Uses raw core-graphics directly because methods 2/3 need
    // CGEventFlags (Fn). The library's EventSource trait deliberately
    // doesn't expose flags (locked decision Q2). This is dev-only code.
    let source = match CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
        Ok(s) => s,
        Err(()) => {
            error!("scroll-test: could not create CGEventSource");
            return;
        }
    };
    let tap_loc = CGEventTapLocation::Session;
    let gap = Duration::from_millis(pause_ms.max(5000));

    // Keycodes from typer_core::keymap would be nicer but we're dipping
    // into raw core-graphics anyway. Match PoC for historical accuracy.
    const KEYCODE_PAGE_DOWN: u16 = 121;
    const KEYCODE_DOWN_ARROW: u16 = 125;

    println!("\n>>> In the target, press Cmd+Home (or scroll to top). 8s...");
    thread::sleep(Duration::from_millis(8000));
    println!("\n=== METHOD 1: raw PageDown keycode ===");
    raw_keytap(&source, KEYCODE_PAGE_DOWN, tap_loc);

    println!("\n>>> Reset cursor in target. 8s...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 2: PageDown + Fn flag ===");
    flagged_keytap(
        &source,
        KEYCODE_PAGE_DOWN,
        CGEventFlags::CGEventFlagSecondaryFn,
        tap_loc,
    );

    println!("\n>>> Reset cursor in target. 8s...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 3: Down + Fn flag ===");
    flagged_keytap(
        &source,
        KEYCODE_DOWN_ARROW,
        CGEventFlags::CGEventFlagSecondaryFn,
        tap_loc,
    );

    println!("\n>>> Reset cursor in target. 8s...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 4: raw PageDown to HID tap ===");
    raw_keytap(&source, KEYCODE_PAGE_DOWN, CGEventTapLocation::HID);

    println!("\n=== done. Which methods moved the cursor? ===");
}

fn raw_keytap(source: &CGEventSource, code: u16, tap: CGEventTapLocation) {
    if let Ok(d) = CGEvent::new_keyboard_event(source.clone(), code, true) {
        d.post(tap);
    }
    thread::sleep(Duration::from_millis(20));
    if let Ok(u) = CGEvent::new_keyboard_event(source.clone(), code, false) {
        u.post(tap);
    }
}

fn flagged_keytap(source: &CGEventSource, code: u16, flags: CGEventFlags, tap: CGEventTapLocation) {
    if let Ok(d) = CGEvent::new_keyboard_event(source.clone(), code, true) {
        d.set_flags(flags);
        d.post(tap);
    }
    thread::sleep(Duration::from_millis(20));
    if let Ok(u) = CGEvent::new_keyboard_event(source.clone(), code, false) {
        u.set_flags(flags);
        u.post(tap);
    }
}

// ---------- helpers ----------

fn do_countdown(secs: u64) {
    for i in (1..=secs).rev() {
        println!("starting in {i}...");
        thread::sleep(Duration::from_secs(1));
    }
}

fn print_diff_lines(stats: &DiffStats, lines: &[DiffLine]) {
    for l in lines {
        match l.kind {
            DiffKind::Match => {} // skip matches — too noisy
            DiffKind::Mismatch => println!(
                "!! {:3}  sent: {}",
                l.index,
                l.sent.as_deref().unwrap_or("")
            ),
            DiffKind::OcrDrop => println!(
                "-- {:3}  drop: {}",
                l.index,
                l.sent.as_deref().unwrap_or("")
            ),
            DiffKind::OcrExtra => println!(
                "++ {:3}  seen: {}",
                l.index,
                l.seen.as_deref().unwrap_or("")
            ),
        }
    }
    println!(
        "---- aligned={} matches={} char_diffs={}/{} accuracy={:.2}% drops={} extras={}",
        stats.aligned_lines,
        stats.matching_lines,
        stats.char_diffs,
        stats.total_chars,
        stats.accuracy_pct(),
        stats.dropped,
        stats.extra
    );
}

fn print_aggregate(runs: &[DiffStats]) {
    println!("\n========== aggregate over {} runs ==========", runs.len());
    let (mut total_aligned, mut total_matching, mut total_diffs, mut total_chars) = (0, 0, 0, 0);
    let mut worst: f64 = 100.0;
    let mut best: f64 = 0.0;
    for (i, s) in runs.iter().enumerate() {
        let acc = s.accuracy_pct();
        if acc < worst {
            worst = acc;
        }
        if acc > best {
            best = acc;
        }
        println!(
            "run {:>2}: {:>3}/{:<3} lines | {:>3}/{:<5} char diffs | {:.2}% | drops {:>2} extras {:>2}",
            i + 1,
            s.matching_lines,
            s.aligned_lines,
            s.char_diffs,
            s.total_chars,
            acc,
            s.dropped,
            s.extra
        );
        total_aligned += s.aligned_lines;
        total_matching += s.matching_lines;
        total_diffs += s.char_diffs;
        total_chars += s.total_chars;
    }
    let overall = if total_chars == 0 {
        100.0
    } else {
        100.0 * (total_chars - total_diffs) as f64 / total_chars as f64
    };
    println!("-----------------------------------------------------------");
    println!("totals: {total_matching}/{total_aligned} lines | {total_diffs}/{total_chars} char diffs | {overall:.2}% overall");
    println!("range: {worst:.2}% .. {best:.2}%");
    info!(
        "aggregate: runs={} total_chars={} char_diffs={} accuracy={:.2}%",
        runs.len(),
        total_chars,
        total_diffs,
        overall
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn cli_send_requires_text_or_file() {
        // Without --text or --file, send still parses (both are Option),
        // but the runtime validation in do_send() rejects it. Parser-
        // level test: confirm send parses fine with no args.
        let parsed = Cli::try_parse_from(["typer", "send"]);
        assert!(parsed.is_ok());
    }

    #[test]
    fn cli_send_accepts_text() {
        let parsed = Cli::try_parse_from(["typer", "send", "--text", "hi"]);
        assert!(parsed.is_ok());
    }

    #[test]
    fn cli_send_rejects_both_text_and_file() {
        let parsed = Cli::try_parse_from(["typer", "send", "--text", "hi", "--file", "/x"]);
        assert!(parsed.is_err());
    }

    #[test]
    fn cli_calibrate_requires_picker() {
        let parsed = Cli::try_parse_from(["typer", "calibrate"]);
        assert!(parsed.is_err());
    }

    #[test]
    fn cli_send_chunk_requires_file_and_ocr() {
        assert!(Cli::try_parse_from(["typer", "send-chunk"]).is_err());
        assert!(Cli::try_parse_from(["typer", "send-chunk", "--file", "/x"]).is_err());
        assert!(Cli::try_parse_from(["typer", "send-chunk", "--ocr", "/x"]).is_err());
        assert!(
            Cli::try_parse_from(["typer", "send-chunk", "--file", "/x", "--ocr", "/y"]).is_ok()
        );
    }

    #[test]
    fn cli_verify_requires_ocr() {
        assert!(Cli::try_parse_from(["typer", "verify"]).is_err());
        assert!(Cli::try_parse_from(["typer", "verify", "--ocr", "/x"]).is_ok());
    }
}
