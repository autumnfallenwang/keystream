//! `typer` — minimal CLI harness for typer-core (v2).
//!
//! Thin wrapper over the library — just the `send` subcommand. Lets you
//! smoke-test the keystroke pipeline against a local TextEdit window
//! without booting the Tauri shell.
//!
//! v1 had Calibrate, ScrollTest, Verify, SendChunk, and five Delete-*
//! probes; v2-2 retired all of them with the OCR pipeline.
//!
//! Run via `cargo run -p typer-core --bin typer -- <args>`.

use clap::{Parser, Subcommand};
use log::{error, info};
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::thread;
use std::time::Duration;
use typer_core::config::COUNTDOWN_SECS;
use typer_core::{
    run_send, ExitReason, RealEventSource, Result, SendCfg, SendControlFlag, TyperError,
};

#[derive(Parser)]
#[command(name = "typer", about = "CLI harness for typer-core (Keystream v2)")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Send a text buffer keystroke-by-keystroke. Use against a local
    /// editor (e.g. TextEdit) to smoke-test the v2 send pipeline.
    Send {
        #[arg(long, conflicts_with = "file")]
        text: Option<String>,
        #[arg(long)]
        file: Option<PathBuf>,

        #[arg(long, default_value_t = COUNTDOWN_SECS)]
        countdown: u64,

        /// Skip the first N chars before typing (Q14: simulates resume
        /// from a previously paused position).
        #[arg(long, default_value_t = 0)]
        start_offset: usize,
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
        Cmd::Send {
            text,
            file,
            countdown,
            start_offset,
        } => do_send(text, file, countdown, start_offset),
    }
}

fn do_send(
    text: Option<String>,
    file: Option<PathBuf>,
    countdown: u64,
    start_offset: usize,
) -> Result<()> {
    let content = match (text, file) {
        (Some(t), _) => t,
        (_, Some(f)) => fs::read_to_string(&f).map_err(|e| TyperError::Io {
            path: f.display().to_string(),
            source: e,
        })?,
        (None, None) => {
            error!("--text or --file required");
            return Ok(());
        }
    };

    let cfg = SendCfg::default();
    // Q12: session_default uses Private source state — see
    // `event_source.rs::session_default()`. The CLI shares the same
    // wrapper as the Tauri shell so it inherits the fix.
    let src = RealEventSource::session_default()?;
    let control = SendControlFlag::new();

    do_countdown(countdown);
    let outcome = run_send(&src, &content, &cfg, &control, start_offset)?;

    let exit = match outcome.reason {
        ExitReason::Completed => "completed".to_string(),
        ExitReason::Paused { position } => format!("paused at position {position}"),
        ExitReason::Stopped { position } => format!("stopped at position {position}"),
    };
    info!(
        "send: {exit} chars_typed={} skipped={} duration_ms={}",
        outcome.chars_typed, outcome.skipped, outcome.duration_ms,
    );
    println!(
        "{exit}\nchars_typed: {}\nskipped: {}\nduration_ms: {}",
        outcome.chars_typed, outcome.skipped, outcome.duration_ms,
    );
    Ok(())
}

fn do_countdown(secs: u64) {
    for i in (1..=secs).rev() {
        println!("starting in {i}...");
        thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn cli_send_parses_with_no_args() {
        // Without --text or --file, send still parses (both are Option),
        // but the runtime check in do_send() rejects it.
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
    fn cli_send_accepts_start_offset() {
        let parsed = Cli::try_parse_from(["typer", "send", "--text", "hi", "--start-offset", "1"]);
        assert!(parsed.is_ok());
    }
}
