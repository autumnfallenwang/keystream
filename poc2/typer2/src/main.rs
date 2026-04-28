//! `typer2` — poc2 experiment harness for Keystream.
//!
//! Standalone crate (excluded from the workspace) that links typer-core
//! READ-ONLY. Adds experimental knobs we want to sweep without polluting
//! the shipped `typer` CLI:
//!
//! - `local` — type a sample, no OCR, visual inspection only
//! - `chunked` — chunked send-and-verify with tunable mod_hold_ms,
//!   event_pause_ms, per-chunk rewarmup, shift-up-between
//! - `score` — read sent + seen text files, count shift-drops
//!
//! Reference: `docs/v2-direction.md`. Reverts here are the v2 reset —
//! the band-aid fold-table additions we made on 2026-04-27 are no
//! longer in `typer-core/src/fold.rs`, so accuracy numbers from this
//! harness reflect raw OCR + raw shift-drops without that masking.

#![cfg(target_os = "macos")]

mod methods;
mod shift_drop;

use clap::{Parser, Subcommand};
use log::{error, info};
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::thread;
use std::time::Duration;
use typer_core::config::{CHUNK_VERIFY_SETTLE_MS, COUNTDOWN_SECS, EVENT_PAUSE_MS, MOD_HOLD_MS};
use typer_core::keymap::KEYCODE_SHIFT;
use typer_core::region::{legacy_config_path, load_region};
use typer_core::{
    chunk_text, run_send, send_chunk, verify_visible, warmup_shift, DiffKind, DiffLine, DiffStats,
    EventSource, RealEventSource, Result, SendCfg,
};

use crate::methods::{run_send_flag_on_char, InjectMethod, SourceState, TapLoc};
use crate::shift_drop::count_shift_drops;

#[derive(Parser)]
#[command(name = "typer2", about = "poc2 experiment harness for Keystream")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Type a sample file into whatever is focused (TextEdit, etc.)
    /// with NO OCR verify. Operator visually inspects the typed text.
    /// Used to disambiguate "is it AVD or is it our side?" — if local
    /// TextEdit shows zero shift-drops, the bug is RDP-side.
    Local {
        #[arg(long)]
        file: PathBuf,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,

        #[arg(long, default_value_t = MOD_HOLD_MS)]
        mod_hold_ms: u64,

        #[arg(long, default_value_t = EVENT_PAUSE_MS)]
        event_pause_ms: u64,

        #[arg(long, default_value_t = 0)]
        char_pause_ms: u64,

        /// Injection method (probe 02c+). Default = sandwich (current Q2).
        #[arg(long, value_enum, default_value_t = InjectMethod::Sandwich)]
        method: InjectMethod,

        /// Tap location (probe 02d). Only meaningful for flag-on-char.
        #[arg(long, value_enum, default_value_t = TapLoc::Session)]
        tap: TapLoc,

        /// Event source state (probe 02e). Only meaningful for flag-on-char.
        #[arg(long, value_enum, default_value_t = SourceState::Combined)]
        source: SourceState,
    },

    /// Chunked send-and-verify against the calibrated region (AVD).
    /// Continues past failures (collects full-run data, no Q10 stop).
    Chunked {
        #[arg(long)]
        file: PathBuf,

        #[arg(long)]
        ocr: PathBuf,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,

        #[arg(long, default_value_t = CHUNK_VERIFY_SETTLE_MS)]
        settle_ms: u64,

        #[arg(long, default_value_t = MOD_HOLD_MS)]
        mod_hold_ms: u64,

        #[arg(long, default_value_t = EVENT_PAUSE_MS)]
        event_pause_ms: u64,

        /// Re-warmup shift before every chunk (default: warmup once at start).
        #[arg(long, default_value_t = false)]
        rewarmup_per_chunk: bool,

        /// Send an explicit shift-up event between chunks (defensive).
        #[arg(long, default_value_t = false)]
        shift_up_between: bool,

        /// Phase B: tap location override (default = Session).
        #[arg(long, value_enum, default_value_t = TapLoc::Session)]
        tap: TapLoc,

        /// Phase B: source state override (default = Combined; Phase A
        /// showed Private fixes shift-drops).
        #[arg(long, value_enum, default_value_t = SourceState::Combined)]
        source: SourceState,
    },

    /// Read two text files (sent + seen-from-OCR), report shift-drop
    /// count and other diff stats. Useful for offline analysis of
    /// captured OCR results without re-running the send.
    Score {
        #[arg(long)]
        sent: PathBuf,

        #[arg(long)]
        seen: PathBuf,
    },

    /// 02j third-party reference probe: type a sample using the enigo
    /// crate. Tests whether a battle-tested external implementation
    /// matches our 02c2/02e/02f/02g/02h winners.
    Enigo {
        #[arg(long)]
        file: PathBuf,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,
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
        Cmd::Local {
            file,
            countdown,
            mod_hold_ms,
            event_pause_ms,
            char_pause_ms,
            method,
            tap,
            source,
        } => do_local(LocalArgs {
            file,
            countdown,
            mod_hold_ms,
            event_pause_ms,
            char_pause_ms,
            method,
            tap,
            source,
        }),
        Cmd::Chunked {
            file,
            ocr,
            countdown,
            settle_ms,
            mod_hold_ms,
            event_pause_ms,
            rewarmup_per_chunk,
            shift_up_between,
            tap,
            source,
        } => do_chunked(ChunkedArgs {
            file,
            ocr,
            countdown,
            settle_ms,
            mod_hold_ms,
            event_pause_ms,
            rewarmup_per_chunk,
            shift_up_between,
            tap,
            source,
        }),
        Cmd::Score { sent, seen } => do_score(&sent, &seen),
        Cmd::Enigo { file, countdown } => do_enigo(&file, countdown),
    }
}

// ---------- local ----------

struct LocalArgs {
    file: PathBuf,
    countdown: u64,
    mod_hold_ms: u64,
    event_pause_ms: u64,
    char_pause_ms: u64,
    method: InjectMethod,
    tap: TapLoc,
    source: SourceState,
}

fn do_local(args: LocalArgs) -> Result<()> {
    let LocalArgs {
        file,
        countdown,
        mod_hold_ms,
        event_pause_ms,
        char_pause_ms,
        method,
        tap,
        source,
    } = args;

    let content = fs::read_to_string(&file).map_err(|e| typer_core::TyperError::Io {
        path: file.display().to_string(),
        source: e,
    })?;

    info!(
        "do_local: method={:?} tap={:?} source={:?} mod_hold_ms={} event_pause_ms={} char_pause_ms={} chars={}",
        method,
        tap,
        source,
        mod_hold_ms,
        event_pause_ms,
        char_pause_ms,
        content.chars().count()
    );

    println!(
        "Focus the target editor. Typing in {countdown}s. (method={method:?} tap={tap:?} source={source:?})"
    );
    do_countdown(countdown);

    match method {
        InjectMethod::Sandwich => {
            let cfg = SendCfg {
                mod_hold_ms,
                event_pause_ms,
                char_pause_ms,
                ..Default::default()
            };
            let src = RealEventSource::new(source.into(), tap.into())?;
            run_send(&src, &content, &cfg)?;
        }
        InjectMethod::FlagOnChar => {
            run_send_flag_on_char(&content, source, tap, event_pause_ms, char_pause_ms)?;
        }
    }

    println!(
        "\nDone. Visually inspect the editor for shift-drops:\n\
         - `(` rendered as `9`, `)` as `0`\n\
         - `Q` rendered as `q`, `:` as `;`, etc."
    );
    Ok(())
}

// ---------- chunked ----------

struct ChunkedArgs {
    file: PathBuf,
    ocr: PathBuf,
    countdown: u64,
    settle_ms: u64,
    mod_hold_ms: u64,
    event_pause_ms: u64,
    rewarmup_per_chunk: bool,
    shift_up_between: bool,
    tap: TapLoc,
    source: SourceState,
}

fn do_chunked(args: ChunkedArgs) -> Result<()> {
    let ChunkedArgs {
        file,
        ocr,
        countdown,
        settle_ms,
        mod_hold_ms,
        event_pause_ms,
        rewarmup_per_chunk,
        shift_up_between,
        tap,
        source,
    } = args;

    let content = fs::read_to_string(&file).map_err(|e| typer_core::TyperError::Io {
        path: file.display().to_string(),
        source: e,
    })?;
    let chunks = chunk_text(&content);
    if chunks.is_empty() {
        println!("(empty input)");
        return Ok(());
    }

    let region = load_region(&legacy_config_path()?)?;
    let cfg = SendCfg {
        mod_hold_ms,
        event_pause_ms,
        ..Default::default()
    };
    info!(
        "do_chunked: tap={:?} source={:?} mod_hold_ms={} event_pause_ms={} rewarmup_per_chunk={} shift_up_between={}",
        tap, source, cfg.mod_hold_ms, cfg.event_pause_ms, rewarmup_per_chunk, shift_up_between
    );

    let src = RealEventSource::new(source.into(), tap.into())?;

    println!(
        "Focus the AVD/RDP editor. Typing starts in {countdown}s. \
         {n_chunks} chunks total.",
        n_chunks = chunks.len()
    );
    do_countdown(countdown);
    warmup_shift(&src, &cfg)?;

    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut total_chars = 0usize;
    let mut total_diffs = 0usize;
    let mut total_shift_drops = 0usize;

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_refs: Vec<&str> = chunk.iter().map(String::as_str).collect();
        let chars: usize = chunk_refs.iter().map(|l| l.chars().count()).sum();
        println!(
            "\nchunk {}/{}: lines={} chars={}",
            i + 1,
            chunks.len(),
            chunk_refs.len(),
            chars
        );

        if rewarmup_per_chunk && i > 0 {
            warmup_shift(&src, &cfg)?;
        }

        send_chunk(&src, &chunk_refs, &cfg)?;

        if shift_up_between {
            // Defensive shift-up between chunks (one event; cheap).
            src.post_key(KEYCODE_SHIFT, false)?;
            thread::sleep(Duration::from_millis(cfg.event_pause_ms));
        }

        thread::sleep(Duration::from_millis(settle_ms));

        let (stats, diff_lines) = verify_visible(&ocr, &region, &chunk_refs)?;
        // Count shift-drops manually from per-line diffs (zip-aligned —
        // good enough for the metric; the real LCS already handled drops).
        let chunk_shift_drops = sum_shift_drops(&diff_lines);

        if stats.passes_q9() {
            println!("  PASS");
            passed += 1;
        } else {
            println!(
                "  FAIL: char_diffs={}/{} shift_drops={}",
                stats.char_diffs, stats.total_chars, chunk_shift_drops
            );
            print_diff_lines(&stats, &diff_lines, chunk_shift_drops);
            failed += 1;
        }
        total_chars += stats.total_chars;
        total_diffs += stats.char_diffs;
        total_shift_drops += chunk_shift_drops;
    }

    let acc = if total_chars == 0 {
        100.0
    } else {
        100.0 * (total_chars - total_diffs) as f64 / total_chars as f64
    };
    println!(
        "\n========== summary ==========\n\
         chunks: {}/{} passed (failed: {})\n\
         total: {} chars, {} diffs, {} shift_drops, {:.2}% accuracy",
        passed,
        chunks.len(),
        failed,
        total_chars,
        total_diffs,
        total_shift_drops,
        acc
    );
    println!(
        "\nshift_drops as % of diffs: {}",
        if total_diffs == 0 {
            "n/a".to_string()
        } else {
            format!(
                "{:.0}%",
                100.0 * total_shift_drops as f64 / total_diffs as f64
            )
        }
    );
    Ok(())
}

fn sum_shift_drops(lines: &[DiffLine]) -> usize {
    lines
        .iter()
        .map(|l| match (l.sent.as_deref(), l.seen.as_deref()) {
            (Some(s), Some(g)) => count_shift_drops(s, g),
            _ => 0,
        })
        .sum()
}

// ---------- score ----------

fn do_score(sent: &std::path::Path, seen: &std::path::Path) -> Result<()> {
    let sent_text = fs::read_to_string(sent).map_err(|e| typer_core::TyperError::Io {
        path: sent.display().to_string(),
        source: e,
    })?;
    let seen_text = fs::read_to_string(seen).map_err(|e| typer_core::TyperError::Io {
        path: seen.display().to_string(),
        source: e,
    })?;

    let drops = count_shift_drops(&sent_text, &seen_text);
    let total = sent_text.chars().count();
    println!(
        "score: sent_chars={} seen_chars={} shift_drops={} drops_per_1k_chars={:.1}",
        total,
        seen_text.chars().count(),
        drops,
        if total == 0 {
            0.0
        } else {
            1000.0 * drops as f64 / total as f64
        }
    );
    Ok(())
}

// ---------- helpers ----------

fn do_countdown(secs: u64) {
    for i in (1..=secs).rev() {
        println!("starting in {i}...");
        thread::sleep(Duration::from_secs(1));
    }
}

fn print_diff_lines(stats: &DiffStats, lines: &[DiffLine], chunk_shift_drops: usize) {
    for l in lines {
        match l.kind {
            DiffKind::Match => {}
            DiffKind::Mismatch => println!(
                "!! {:3}  sent: {}\n         seen: {}",
                l.index,
                l.sent.as_deref().unwrap_or(""),
                l.seen.as_deref().unwrap_or("")
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
        "---- aligned={} matches={} char_diffs={}/{} shift_drops={} accuracy={:.2}% drops={} extras={}",
        stats.aligned_lines,
        stats.matching_lines,
        stats.char_diffs,
        stats.total_chars,
        chunk_shift_drops,
        stats.accuracy_pct(),
        stats.dropped,
        stats.extra
    );
}

// ---------- enigo (probe 02j) ----------

fn do_enigo(file: &std::path::Path, countdown: u64) -> Result<()> {
    use enigo::{Enigo, Keyboard, Settings};

    let content = fs::read_to_string(file).map_err(|e| typer_core::TyperError::Io {
        path: file.display().to_string(),
        source: e,
    })?;

    info!("do_enigo: chars={}", content.chars().count());
    println!("Focus the target editor. Typing in {countdown}s. (method=enigo)");
    do_countdown(countdown);

    let mut e = Enigo::new(&Settings::default()).map_err(|err| typer_core::TyperError::Io {
        path: "(enigo)".to_string(),
        source: std::io::Error::other(format!("enigo init: {err}")),
    })?;
    e.text(&content).map_err(|err| typer_core::TyperError::Io {
        path: "(enigo)".to_string(),
        source: std::io::Error::other(format!("enigo text: {err}")),
    })?;
    println!("\nDone. Visually inspect the editor for shift-drops.");
    Ok(())
}
