mod keymap;

use clap::{Parser, Subcommand};
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use keymap::{char_to_keycode, KEYCODE_A, KEYCODE_CONTROL, KEYCODE_DELETE, KEYCODE_HOME, KEYCODE_PAGE_DOWN, KEYCODE_PAGE_UP, KEYCODE_RETURN, KEYCODE_SHIFT};
use rand::Rng;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

#[derive(Parser)]
#[command(name = "typer", about = "Reliable keycode sender for AVD / Windows App")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Launch the region picker to choose the AVD text area; save to ~/.typer/config.json
    Calibrate {
        /// Path to the region_picker binary
        #[arg(long, default_value = "/Users/nicolewang/github/py_typing_simulator/poc/ocr_helper/region_picker")]
        picker: String,
    },
    /// Send scroll keystrokes 4 different ways so user can watch which reach AVD.
    ScrollTest {
        #[arg(long, default_value_t = 3)]
        countdown: u64,

        /// Pause between methods so user can tell them apart
        #[arg(long, default_value_t = 2500)]
        pause_ms: u64,
    },
    /// Screenshot the calibrated region and OCR it (debug)
    Verify {
        #[arg(long, default_value = "/Users/nicolewang/github/py_typing_simulator/poc/ocr_helper/ocr_helper")]
        ocr: String,
    },
    Send {
        #[arg(long, conflicts_with = "file")]
        text: Option<String>,

        #[arg(long)]
        file: Option<String>,

        /// Sleep after each key event (matches cliclick's 10ms)
        #[arg(long, default_value_t = 10)]
        event_pause_ms: u64,

        /// Extra pause between characters
        #[arg(long, default_value_t = 0)]
        char_pause_ms: u64,

        #[arg(long, default_value_t = 0)]
        jitter_ms: u64,

        #[arg(long, default_value_t = 3)]
        countdown: u64,

        /// Hold time between shift down/up and the char event
        #[arg(long, default_value_t = 10)]
        mod_hold_ms: u64,

        /// Do a dummy shift press+release during countdown to warm up VM modifier state
        #[arg(long, default_value_t = true)]
        warmup_shift: bool,

        /// Event source state: hid | combined | private
        #[arg(long, default_value = "combined")]
        state: String,

        /// Event tap location: hid | session | annotated
        #[arg(long, default_value = "session")]
        tap: String,

        /// After typing, screenshot the calibrated region, OCR it, and print sent-vs-seen
        #[arg(long, default_value_t = false)]
        verify: bool,

        /// Path to ocr_helper binary (used when --verify is set)
        #[arg(long, default_value = "/Users/nicolewang/github/py_typing_simulator/poc/ocr_helper/ocr_helper")]
        ocr: String,

        /// Like --verify but scrolls (Ctrl+Home then PageDowns), OCRs each viewport, stitches by overlap.
        /// Use for files taller than one screen.
        #[arg(long, default_value_t = false)]
        scroll_verify: bool,

        /// Max PageDown steps during scroll_verify (safety cap)
        #[arg(long, default_value_t = 30)]
        scroll_max_pages: u32,

        /// Wait after each scroll keystroke before screenshotting
        #[arg(long, default_value_t = 250)]
        scroll_settle_ms: u64,

        /// Repeat the send (and verify, if enabled) this many times back-to-back.
        /// Between runs, sends Ctrl+A then Delete to clear the editor.
        #[arg(long, default_value_t = 1)]
        runs: u32,

        /// Between-run wait (ms)
        #[arg(long, default_value_t = 1500)]
        run_gap_ms: u64,
    },
}

struct SendCfg {
    event_pause_ms: u64,
    char_pause_ms: u64,
    jitter_ms: u64,
    mod_hold_ms: u64,
    warmup_shift: bool,
    state_id: CGEventSourceStateID,
    tap_loc: CGEventTapLocation,
}

fn main() {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Calibrate { picker } => {
            run_calibrate(&picker);
        }
        Cmd::ScrollTest { countdown, pause_ms } => {
            run_scroll_test(countdown, pause_ms);
        }
        Cmd::Verify { ocr } => {
            run_verify(&ocr);
        }
        Cmd::Send { text, file, event_pause_ms, char_pause_ms, jitter_ms, countdown, mod_hold_ms, warmup_shift, state, tap, verify, ocr, scroll_verify, scroll_max_pages, scroll_settle_ms, runs, run_gap_ms } => {
            let content = match (text, file) {
                (Some(t), _) => t,
                (_, Some(f)) => fs::read_to_string(&f)
                    .unwrap_or_else(|e| { eprintln!("read {f}: {e}"); std::process::exit(1) }),
                _ => { eprintln!("--text or --file required"); std::process::exit(2) }
            };
            let state_id = match state.as_str() {
                "hid" => CGEventSourceStateID::HIDSystemState,
                "combined" => CGEventSourceStateID::CombinedSessionState,
                "private" => CGEventSourceStateID::Private,
                other => { eprintln!("unknown --state {other}; use hid|combined|private"); std::process::exit(2) }
            };
            let tap_loc = match tap.as_str() {
                "hid" => CGEventTapLocation::HID,
                "session" => CGEventTapLocation::Session,
                "annotated" => CGEventTapLocation::AnnotatedSession,
                other => { eprintln!("unknown --tap {other}; use hid|session|annotated"); std::process::exit(2) }
            };
            let cfg = SendCfg {
                event_pause_ms, char_pause_ms, jitter_ms, mod_hold_ms,
                warmup_shift, state_id, tap_loc,
            };
            let mut agg: Vec<DiffStats> = Vec::new();
            for run in 1..=runs {
                if runs > 1 { println!("\n########## run {run}/{runs} ##########"); }
                // Only the first run uses the countdown; subsequent runs pause briefly.
                let cd = if run == 1 { countdown } else { 0 };
                run_send(&content, cd, &cfg);
                if scroll_verify {
                    thread::sleep(Duration::from_millis(500));
                    if let Some(stats) = run_scroll_verify(&ocr, &content, &cfg, scroll_max_pages, scroll_settle_ms) {
                        agg.push(stats);
                    }
                } else if verify {
                    thread::sleep(Duration::from_millis(500));
                    if let Some(stats) = run_verify_diff(&ocr, &content) {
                        agg.push(stats);
                    }
                }
                if run < runs {
                    // Clear between runs: Ctrl+A then Delete.
                    let source = CGEventSource::new(cfg.state_id).expect("event source");
                    clear_editor(&source, &cfg);
                    thread::sleep(Duration::from_millis(run_gap_ms));
                }
            }
            if agg.len() > 1 { print_aggregate(&agg); }
        }
    }
}

fn run_send(text: &str, countdown: u64, cfg: &SendCfg) {
    for i in (1..=countdown).rev() {
        println!("starting in {i}...");
        thread::sleep(Duration::from_secs(1));
    }
    println!("typing {} chars (state={:?} tap={:?})", text.chars().count(), cfg.state_id, cfg.tap_loc);

    let source = CGEventSource::new(cfg.state_id)
        .expect("could not create CGEventSource");

    // Shift warmup: prime the VM's modifier state so the first shifted char doesn't get dropped
    if cfg.warmup_shift {
        key_event(&source, KEYCODE_SHIFT, true, cfg.tap_loc);
        thread::sleep(Duration::from_millis(cfg.mod_hold_ms.max(10)));
        key_event(&source, KEYCODE_SHIFT, false, cfg.tap_loc);
        thread::sleep(Duration::from_millis(50));
    }

    let mut rng = rand::thread_rng();
    let mut sent = 0u64;
    let mut skipped = 0u64;

    for ch in text.chars() {
        if ch == '\n' {
            tap_key(&source, KEYCODE_RETURN, cfg);
        } else if ch == '\r' {
            // handled by \n
        } else {
            match char_to_keycode(ch) {
                Some((code, shift)) => {
                    send_char(&source, code, shift, cfg);
                }
                None => {
                    eprintln!("skip unmapped char: {:?}", ch);
                    skipped += 1;
                }
            }
        }

        let jitter = if cfg.jitter_ms == 0 { 0 } else { rng.gen_range(0..=cfg.jitter_ms) };
        if cfg.char_pause_ms + jitter > 0 {
            thread::sleep(Duration::from_millis(cfg.char_pause_ms + jitter));
        }
        sent += 1;
    }

    println!("done. {sent} chars processed, {skipped} skipped (unmapped).");
}

fn send_char(source: &CGEventSource, code: u16, shift: bool, cfg: &SendCfg) {
    if shift {
        key_event(source, KEYCODE_SHIFT, true, cfg.tap_loc);
        thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    }
    key_event(source, code, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    key_event(source, code, false, cfg.tap_loc);
    if shift {
        thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
        key_event(source, KEYCODE_SHIFT, false, cfg.tap_loc);
        thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    }
}

fn tap_key(source: &CGEventSource, keycode: u16, cfg: &SendCfg) {
    key_event(source, keycode, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    key_event(source, keycode, false, cfg.tap_loc);
}

fn key_event(source: &CGEventSource, keycode: u16, down: bool, tap_loc: CGEventTapLocation) {
    let ev = CGEvent::new_keyboard_event(source.clone(), keycode, down)
        .expect("keyboard event");
    ev.post(tap_loc);
}

// ---------- config ----------

struct Region { x: i32, y: i32, w: i32, h: i32 }

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME not set");
    PathBuf::from(home).join(".typer").join("config.txt")
}

fn save_region(r: &Region) -> std::io::Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, format!("{} {} {} {}\n", r.x, r.y, r.w, r.h))?;
    Ok(())
}

fn load_region() -> Option<Region> {
    let raw = fs::read_to_string(config_path()).ok()?;
    let parts: Vec<i32> = raw.split_whitespace().filter_map(|s| s.parse().ok()).collect();
    if parts.len() == 4 {
        Some(Region { x: parts[0], y: parts[1], w: parts[2], h: parts[3] })
    } else {
        None
    }
}

// ---------- calibrate ----------

fn run_calibrate(picker: &str) {
    println!("Drag a rectangle over the AVD text area. Press Esc to cancel.");
    let out = Command::new(picker).output()
        .unwrap_or_else(|e| { eprintln!("could not run picker at {picker}: {e}"); std::process::exit(1) });
    if !out.status.success() {
        eprintln!("picker failed: {}", String::from_utf8_lossy(&out.stderr));
        std::process::exit(1);
    }
    let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let parts: Vec<i32> = line.split_whitespace().filter_map(|s| s.parse().ok()).collect();
    if parts.len() != 4 {
        eprintln!("picker returned bad output: {:?}", line);
        std::process::exit(1);
    }
    let r = Region { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    save_region(&r).expect("save region");
    println!("saved region: x={} y={} w={} h={} -> {}", r.x, r.y, r.w, r.h, config_path().display());
}

// ---------- verify (debug) ----------

fn run_verify(ocr: &str) {
    let r = load_region().unwrap_or_else(|| {
        eprintln!("no saved region. Run `typer calibrate` first.");
        std::process::exit(1);
    });
    let tmp = std::env::temp_dir().join("typer_verify.png");
    let region_arg = format!("{},{},{},{}", r.x, r.y, r.w, r.h);
    let status = Command::new("screencapture")
        .args(["-x", "-R", &region_arg, tmp.to_str().unwrap()])
        .status()
        .expect("screencapture");
    if !status.success() {
        eprintln!("screencapture failed");
        std::process::exit(1);
    }
    println!("captured to {}", tmp.display());
    let out = Command::new(ocr).arg(&tmp).output()
        .unwrap_or_else(|e| { eprintln!("could not run ocr at {ocr}: {e}"); std::process::exit(1) });
    if !out.status.success() {
        eprintln!("ocr failed: {}", String::from_utf8_lossy(&out.stderr));
        std::process::exit(1);
    }
    println!("{}", String::from_utf8_lossy(&out.stdout));
}

// ---------- verify + diff (pass-through, no retry) ----------

fn run_verify_diff(ocr: &str, sent: &str) -> Option<DiffStats> {
    let r = match load_region() {
        Some(r) => r,
        None => { eprintln!("[verify] no saved region. Run `typer calibrate` first."); return None; }
    };
    let tmp = std::env::temp_dir().join("typer_verify.png");
    let region_arg = format!("{},{},{},{}", r.x, r.y, r.w, r.h);
    let status = Command::new("screencapture")
        .args(["-x", "-R", &region_arg, tmp.to_str().unwrap()])
        .status();
    match status {
        Ok(s) if s.success() => {}
        Ok(s) => { eprintln!("[verify] screencapture exited {s}"); return None; }
        Err(e) => { eprintln!("[verify] screencapture failed: {e}"); return None; }
    }
    let out = match Command::new(ocr).arg(&tmp).output() {
        Ok(o) if o.status.success() => o,
        Ok(o) => { eprintln!("[verify] ocr failed: {}", String::from_utf8_lossy(&o.stderr)); return None; }
        Err(e) => { eprintln!("[verify] could not run ocr at {ocr}: {e}"); return None; }
    };
    let raw = String::from_utf8_lossy(&out.stdout);
    let seen = parse_ocr_lines(&raw)?;
    Some(print_diff(sent, &seen))
}

fn parse_ocr_lines(json: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let arr = v.get("lines")?.as_array()?;
    let lines: Vec<String> = arr.iter()
        .filter_map(|e| e.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
        .collect();
    Some(lines.join("\n"))
}

#[allow(dead_code)]
#[derive(Default, Clone)]
struct DiffStats {
    aligned_lines: usize,
    matching_lines: usize,
    char_diffs: usize,
    total_chars: usize,
    dropped: usize,
    extra: usize,
    sent_chars: usize,
    seen_chars: usize,
}

fn print_diff(sent: &str, seen: &str) -> DiffStats {
    println!("\n---- verify (sent vs seen) ----");

    // Normalize: drop blank lines, strip leading whitespace per line.
    // OCR drops blank lines and eats indentation, so raw line-by-line alignment is noisy.
    let norm = |s: &str| -> Vec<String> {
        s.lines()
            .map(|l| l.trim_start().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    };
    let sent_lines = norm(sent);
    let seen_lines = norm(seen);

    // LCS-based line alignment on folded lines. OCR drops/merges some lines,
    // so index-zip produces cascading misalignment. Align first, then diff.
    let pairs = align_lines(&sent_lines, &seen_lines);

    let mut line_matches = 0usize;
    let mut char_mismatches = 0usize;
    let mut total_chars = 0usize;
    let mut dropped_by_ocr = 0usize;
    let mut hallucinated_by_ocr = 0usize;

    for (i, (si, gi)) in pairs.iter().enumerate() {
        let s = si.and_then(|k| sent_lines.get(k)).map(|x| x.as_str()).unwrap_or("");
        let g = gi.and_then(|k| seen_lines.get(k)).map(|x| x.as_str()).unwrap_or("");
        match (si, gi) {
            (Some(_), None) => {
                dropped_by_ocr += 1;
                println!("OCR_DROP {i:>3} sent: {s}");
                // Don't count OCR drops as typing errors — can't verify either way.
            }
            (None, Some(_)) => {
                hallucinated_by_ocr += 1;
                println!("OCR_XTRA {i:>3} seen: {g}");
            }
            (Some(_), Some(_)) => {
                let (char_diffs, compared) = count_char_diffs(s, g);
                total_chars += compared;
                char_mismatches += char_diffs;
                let line_ok = char_diffs == 0;
                if line_ok { line_matches += 1; }
                let mark = if line_ok { "  " } else { "!!" };
                println!("{mark} {i:>3} sent: {s}");
                println!("{mark} {i:>3} seen: {g}");
                if !line_ok {
                    println!("     {i:>3} diff: {char_diffs} char(s) differ after fold");
                }
            }
            (None, None) => {}
        }
    }
    let sent_chars = sent.chars().count();
    let seen_chars = seen.chars().count();
    let aligned = pairs.iter().filter(|(a, b)| a.is_some() && b.is_some()).count();
    let accuracy = if total_chars == 0 { 100.0 } else {
        100.0 * (total_chars - char_mismatches) as f64 / total_chars as f64
    };
    println!("---- {line_matches}/{aligned} aligned lines match | {char_mismatches}/{total_chars} char diffs after fold ({accuracy:.2}%) ----");
    println!("---- OCR dropped {dropped_by_ocr} sent lines, added {hallucinated_by_ocr} extra lines ----");
    println!("---- raw: sent {sent_chars} chars, seen {seen_chars} chars ----\n");

    DiffStats {
        aligned_lines: aligned,
        matching_lines: line_matches,
        char_diffs: char_mismatches,
        total_chars,
        dropped: dropped_by_ocr,
        extra: hallucinated_by_ocr,
        sent_chars,
        seen_chars,
    }
}

// LCS-based alignment. Returns pairs of (sent_idx, seen_idx) where None means
// one side is missing (drop/insert). Folded equality used for matching.
fn align_lines(a: &[String], b: &[String]) -> Vec<(Option<usize>, Option<usize>)> {
    let n = a.len();
    let m = b.len();
    let af: Vec<String> = a.iter().map(|s| fold_line(s)).collect();
    let bf: Vec<String> = b.iter().map(|s| fold_line(s)).collect();

    // dp[i][j] = LCS length using a[..i] and b[..j]
    let mut dp = vec![vec![0u32; m + 1]; n + 1];
    for i in 0..n {
        for j in 0..m {
            dp[i + 1][j + 1] = if lines_similar(&af[i], &bf[j]) {
                dp[i][j] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    // Backtrack to produce alignment.
    let mut out: Vec<(Option<usize>, Option<usize>)> = Vec::new();
    let (mut i, mut j) = (n, m);
    while i > 0 && j > 0 {
        if lines_similar(&af[i - 1], &bf[j - 1]) {
            out.push((Some(i - 1), Some(j - 1)));
            i -= 1; j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            out.push((Some(i - 1), None));
            i -= 1;
        } else {
            out.push((None, Some(j - 1)));
            j -= 1;
        }
    }
    while i > 0 { out.push((Some(i - 1), None)); i -= 1; }
    while j > 0 { out.push((None, Some(j - 1))); j -= 1; }
    out.reverse();
    out
}

// Two folded lines are "the same line" if ≥70% of chars match at the same position
// after folding. Looser than strict equality so OCR typos don't break alignment.
fn lines_similar(a: &str, b: &str) -> bool {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let n = ac.len().max(bc.len());
    if n == 0 { return true; }
    let min_len = ac.len().min(bc.len());
    if min_len == 0 { return false; }
    let mut same = 0usize;
    for k in 0..min_len {
        if ac[k] == bc[k] { same += 1; }
    }
    (same as f64) / (n as f64) >= 0.7
}

// Fold characters that OCR routinely confuses. Applied to BOTH sides before compare.
fn fold_char(c: char) -> char {
    match c {
        // backtick <-> apostrophe
        '`' | '\'' => '\'',
        // angle brackets vs guillemets
        '<' | '‹' => '<',
        '>' | '›' => '>',
        // double-quote variants
        '"' | '\u{201C}' | '\u{201D}' => '"',
        // case-fold letters (OCR flips case on some chars: User -> user, URL -> uRL)
        c if c.is_ascii_alphabetic() => c.to_ascii_lowercase(),
        // digit/letter lookalikes
        '0' | 'O' | 'o' => 'o',
        '1' | 'l' | 'I' | 'i' => 'i',
        c => c,
    }
}

fn fold_line(s: &str) -> String {
    s.chars().map(fold_char).collect()
}

// Count char differences between two lines after folding. Aligns by zipping;
// length mismatch counts as extra diffs.
fn count_char_diffs(a: &str, b: &str) -> (usize, usize) {
    let af = fold_line(a);
    let bf = fold_line(b);
    let ac: Vec<char> = af.chars().collect();
    let bc: Vec<char> = bf.chars().collect();
    let n = ac.len().max(bc.len());
    let mut diffs = 0;
    for i in 0..n {
        match (ac.get(i), bc.get(i)) {
            (Some(x), Some(y)) if x == y => {}
            _ => diffs += 1,
        }
    }
    (diffs, n)
}

// ---------- scroll + stitch verify ----------

fn run_scroll_verify(ocr: &str, sent: &str, cfg: &SendCfg, max_pages: u32, settle_ms: u64) -> Option<DiffStats> {
    let r = match load_region() {
        Some(r) => r,
        None => { eprintln!("[scroll_verify] no saved region. Run `typer calibrate` first."); return None; }
    };

    let source = match CGEventSource::new(cfg.state_id) {
        Ok(s) => s,
        Err(_) => { eprintln!("[scroll_verify] could not create event source"); return None; }
    };

    // PageUp x N → scroll to top. Ctrl+Home turned out to not reach AVD reliably,
    // but plain PageDown/PageUp keycodes do. Repeat PageUp enough to cover any file.
    println!("[scroll_verify] PageUp x40 → top");
    for _ in 0..40 {
        key_event(&source, KEYCODE_PAGE_UP, true, cfg.tap_loc);
        thread::sleep(Duration::from_millis(cfg.event_pause_ms));
        key_event(&source, KEYCODE_PAGE_UP, false, cfg.tap_loc);
        thread::sleep(Duration::from_millis(30));
    }
    thread::sleep(Duration::from_millis(settle_ms));

    let mut chunks: Vec<Vec<String>> = Vec::new();
    let first = capture_ocr_lines(ocr, &r);
    if let Some(lines) = first {
        chunks.push(lines);
    } else {
        eprintln!("[scroll_verify] first capture failed");
        return None;
    }

    for step in 1..=max_pages {
        key_event(&source, KEYCODE_PAGE_DOWN, true, cfg.tap_loc);
        thread::sleep(Duration::from_millis(cfg.event_pause_ms));
        key_event(&source, KEYCODE_PAGE_DOWN, false, cfg.tap_loc);
        thread::sleep(Duration::from_millis(settle_ms));

        let lines = match capture_ocr_lines(ocr, &r) {
            Some(l) => l,
            None => { eprintln!("[scroll_verify] capture failed on step {step}"); return None; }
        };

        // Stop if this chunk is ~identical to the previous one (viewport didn't change → hit bottom)
        let prev = chunks.last().unwrap();
        if chunks_equivalent(prev, &lines) {
            println!("[scroll_verify] viewport stopped moving at step {step} (reached bottom)");
            break;
        }
        chunks.push(lines);
    }

    // Stitch: for each pair, find overlap of A-tail / B-head and drop the overlap from B.
    let stitched = stitch_chunks(&chunks);
    let seen = stitched.join("\n");

    println!("[scroll_verify] captured {} chunks, stitched to {} lines", chunks.len(), stitched.len());
    Some(print_diff(sent, &seen))
}

fn send_ctrl_combo(source: &CGEventSource, code: u16, cfg: &SendCfg) {
    // Raw key approach (like the cliclick shift recipe) — no flags, just down/up of Ctrl around target key.
    key_event(source, KEYCODE_CONTROL, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    key_event(source, code, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    key_event(source, code, false, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    key_event(source, KEYCODE_CONTROL, false, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
}

fn capture_ocr_lines(ocr: &str, r: &Region) -> Option<Vec<String>> {
    let tmp = std::env::temp_dir().join("typer_scroll.png");
    let region_arg = format!("{},{},{},{}", r.x, r.y, r.w, r.h);
    let status = Command::new("screencapture")
        .args(["-x", "-R", &region_arg, tmp.to_str()?])
        .status().ok()?;
    if !status.success() { return None; }
    let out = Command::new(ocr).arg(&tmp).output().ok()?;
    if !out.status.success() { return None; }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let arr = v.get("lines")?.as_array()?;
    let lines: Vec<String> = arr.iter()
        .filter_map(|e| e.get("text").and_then(|t| t.as_str()).map(|s| s.trim_start().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    Some(lines)
}

// Considered equivalent when their last ~5 lines match under the similarity rule —
// i.e. the bottom of the viewport didn't change, we've hit the end of the document.
fn chunks_equivalent(a: &[String], b: &[String]) -> bool {
    let k = 5.min(a.len()).min(b.len());
    if k == 0 { return a.is_empty() && b.is_empty(); }
    let a_tail = &a[a.len() - k..];
    let b_tail = &b[b.len() - k..];
    a_tail.iter().zip(b_tail.iter())
        .all(|(x, y)| lines_similar(&fold_line(x), &fold_line(y)))
}

// Stitch chunks by finding the longest overlap between the tail of the accumulated
// result and the head of the next chunk, then appending only the non-overlapping part.
fn stitch_chunks(chunks: &[Vec<String>]) -> Vec<String> {
    if chunks.is_empty() { return Vec::new(); }
    let mut acc: Vec<String> = chunks[0].clone();
    for next in chunks.iter().skip(1) {
        let overlap = find_overlap(&acc, next);
        acc.extend(next.iter().skip(overlap).cloned());
    }
    acc
}

// Returns the length k such that acc[acc.len()-k..] matches next[..k] under the
// similarity rule (lines_similar). Prefers larger k to consume the most overlap.
// Requires k >= 3 to avoid random short matches ("};", "}", "") aligning spuriously.
fn find_overlap(acc: &[String], next: &[String]) -> usize {
    let max_k = acc.len().min(next.len()).min(40);
    for k in (3..=max_k).rev() {
        let tail = &acc[acc.len() - k..];
        let head = &next[..k];
        let ok = tail.iter().zip(head.iter())
            .all(|(a, b)| lines_similar(&fold_line(a), &fold_line(b)));
        if ok { return k; }
    }
    0
}

// ---------- scroll-test ----------
// Fires 4 different PageDown implementations with long pauses and announcements.
// User watches AVD Notepad and reports which methods moved the cursor.

fn run_scroll_test(countdown: u64, pause_ms: u64) {
    for i in (1..=countdown).rev() {
        println!("starting in {i}...");
        thread::sleep(Duration::from_secs(1));
    }

    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .expect("could not create CGEventSource");
    let tap_loc = CGEventTapLocation::Session;

    // Long pause BEFORE each method so user can press Cmd+Home in AVD to reset
    // cursor to line 1, then watch only that method's effect.
    let gap = Duration::from_millis(pause_ms.max(5000));

    println!("\n>>> In AVD, press Cmd+Home (or scroll to the top) so cursor is at line 1.");
    println!(">>> You have 8 seconds.");
    thread::sleep(Duration::from_millis(8000));
    println!("\n=== METHOD 1 fires NOW: raw PageDown keycode ===");
    raw_keytap(&source, KEYCODE_PAGE_DOWN, tap_loc);
    println!("=== METHOD 1 done. Note cursor line. ===");

    println!("\n>>> Press Cmd+Home in AVD again. 8 seconds...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 2 fires NOW: PageDown + Fn flag ===");
    flagged_keytap(&source, KEYCODE_PAGE_DOWN, CGEventFlags::CGEventFlagSecondaryFn, tap_loc);
    println!("=== METHOD 2 done. Note cursor line. ===");

    println!("\n>>> Press Cmd+Home in AVD again. 8 seconds...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 3 fires NOW: Down arrow + Fn flag ===");
    fn_modifier_keytap(&source, 125, tap_loc);
    println!("=== METHOD 3 done. Note cursor line. ===");

    println!("\n>>> Press Cmd+Home in AVD again. 8 seconds...");
    thread::sleep(gap);
    thread::sleep(Duration::from_millis(3000));
    println!("\n=== METHOD 4 fires NOW: raw PageDown posted to HID tap ===");
    raw_keytap(&source, KEYCODE_PAGE_DOWN, CGEventTapLocation::HID);
    println!("=== METHOD 4 done. Note cursor line. ===");

    println!("\n=== all done. For each method: did cursor jump ~30 lines (good), go to bottom (over-shot), or not move (fail)? ===");
}

fn raw_keytap(source: &CGEventSource, code: u16, tap: CGEventTapLocation) {
    let d = CGEvent::new_keyboard_event(source.clone(), code, true).expect("kbd event");
    d.post(tap);
    thread::sleep(Duration::from_millis(20));
    let u = CGEvent::new_keyboard_event(source.clone(), code, false).expect("kbd event");
    u.post(tap);
}

fn flagged_keytap(source: &CGEventSource, code: u16, flags: CGEventFlags, tap: CGEventTapLocation) {
    let d = CGEvent::new_keyboard_event(source.clone(), code, true).expect("kbd event");
    d.set_flags(flags);
    d.post(tap);
    thread::sleep(Duration::from_millis(20));
    let u = CGEvent::new_keyboard_event(source.clone(), code, false).expect("kbd event");
    u.set_flags(flags);
    u.post(tap);
}

fn fn_modifier_keytap(source: &CGEventSource, code: u16, tap: CGEventTapLocation) {
    // Fn key has no keycode in the usual sense; use the flag approach.
    // Send Down keycode with Fn flag so AVD interprets it as PageDown (like Fn+Down).
    let d = CGEvent::new_keyboard_event(source.clone(), code, true).expect("kbd event");
    d.set_flags(CGEventFlags::CGEventFlagSecondaryFn);
    d.post(tap);
    thread::sleep(Duration::from_millis(20));
    let u = CGEvent::new_keyboard_event(source.clone(), code, false).expect("kbd event");
    u.set_flags(CGEventFlags::CGEventFlagSecondaryFn);
    u.post(tap);
}

// Clear Notepad: Ctrl+A (select all), then Delete.
fn clear_editor(source: &CGEventSource, cfg: &SendCfg) {
    // Ctrl down
    key_event(source, KEYCODE_CONTROL, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    // A down/up
    key_event(source, KEYCODE_A, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    key_event(source, KEYCODE_A, false, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.mod_hold_ms));
    // Ctrl up
    key_event(source, KEYCODE_CONTROL, false, cfg.tap_loc);
    thread::sleep(Duration::from_millis(150));
    // Delete (backspace)
    key_event(source, KEYCODE_DELETE, true, cfg.tap_loc);
    thread::sleep(Duration::from_millis(cfg.event_pause_ms));
    key_event(source, KEYCODE_DELETE, false, cfg.tap_loc);
    thread::sleep(Duration::from_millis(150));
}

fn print_aggregate(runs: &[DiffStats]) {
    println!("\n========== aggregate over {} runs ==========", runs.len());
    let mut total_aligned = 0usize;
    let mut total_matching = 0usize;
    let mut total_char_diffs = 0usize;
    let mut total_chars_compared = 0usize;
    let mut total_sent = 0usize;
    let mut worst_acc = 100.0f64;
    let mut best_acc = 0.0f64;
    for (i, s) in runs.iter().enumerate() {
        let acc = if s.total_chars == 0 { 100.0 } else {
            100.0 * (s.total_chars - s.char_diffs) as f64 / s.total_chars as f64
        };
        if acc < worst_acc { worst_acc = acc; }
        if acc > best_acc { best_acc = acc; }
        println!("run {:>2}: {:>3}/{:<3} lines | {:>3}/{:<5} char diffs | {:.2}% | drops {:>2} extras {:>2}",
            i + 1, s.matching_lines, s.aligned_lines, s.char_diffs, s.total_chars, acc, s.dropped, s.extra);
        total_aligned += s.aligned_lines;
        total_matching += s.matching_lines;
        total_char_diffs += s.char_diffs;
        total_chars_compared += s.total_chars;
        total_sent += s.sent_chars;
    }
    let overall = if total_chars_compared == 0 { 100.0 } else {
        100.0 * (total_chars_compared - total_char_diffs) as f64 / total_chars_compared as f64
    };
    println!("-----------------------------------------------------------");
    println!("totals: {total_matching}/{total_aligned} lines | {total_char_diffs}/{total_chars_compared} char diffs | {overall:.2}% overall | {total_sent} chars sent");
    println!("range: {worst_acc:.2}% .. {best_acc:.2}%");
    println!("===========================================================\n");
}
