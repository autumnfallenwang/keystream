//! Sent-vs-seen diff. Pure: no I/O, no logging of content. Computes
//! `DiffStats` + a `Vec<DiffLine>` that callers (CLI, Tauri command) can
//! render however they like.

use crate::align::{align_lines, count_char_diffs};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffKind {
    /// Lines aligned and identical after fold.
    Match,
    /// Lines aligned but had char differences after fold.
    Mismatch,
    /// Sent line had no counterpart in OCR (OCR dropped it).
    OcrDrop,
    /// OCR had an extra line with no counterpart in sent text.
    OcrExtra,
}

#[derive(Debug, Clone)]
pub struct DiffLine {
    pub kind: DiffKind,
    pub index: usize,
    pub sent: Option<String>,
    pub seen: Option<String>,
    pub char_diffs: usize,
}

#[derive(Default, Clone, Debug)]
pub struct DiffStats {
    pub aligned_lines: usize,
    pub matching_lines: usize,
    pub char_diffs: usize,
    pub total_chars: usize,
    pub dropped: usize,
    pub extra: usize,
    pub sent_chars: usize,
    pub seen_chars: usize,
}

impl DiffStats {
    pub fn accuracy_pct(&self) -> f64 {
        if self.total_chars == 0 {
            100.0
        } else {
            100.0 * (self.total_chars - self.char_diffs) as f64 / self.total_chars as f64
        }
    }
}

/// Compute diff stats + per-line diff records. Normalises both sides by
/// stripping leading whitespace per line and dropping blank lines (OCR
/// eats indentation and blank lines deterministically).
///
/// Logs a single INFO summary line ("verify: aligned=X matches=Y ...").
/// Never logs content — per rules/security.md, counts only.
pub fn compute_diff(sent: &str, seen: &str) -> (DiffStats, Vec<DiffLine>) {
    let norm = |s: &str| -> Vec<String> {
        s.lines()
            .map(|l| l.trim_start().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    };
    let sent_lines = norm(sent);
    let seen_lines = norm(seen);

    let pairs = align_lines(&sent_lines, &seen_lines);

    let mut out_lines: Vec<DiffLine> = Vec::new();
    let mut line_matches = 0usize;
    let mut char_mismatches = 0usize;
    let mut total_chars = 0usize;
    let mut dropped_by_ocr = 0usize;
    let mut hallucinated_by_ocr = 0usize;

    for (i, (si, gi)) in pairs.iter().enumerate() {
        let s = si.and_then(|k| sent_lines.get(k)).cloned();
        let g = gi.and_then(|k| seen_lines.get(k)).cloned();
        match (si, gi) {
            (Some(_), None) => {
                dropped_by_ocr += 1;
                out_lines.push(DiffLine {
                    kind: DiffKind::OcrDrop,
                    index: i,
                    sent: s,
                    seen: None,
                    char_diffs: 0,
                });
            }
            (None, Some(_)) => {
                hallucinated_by_ocr += 1;
                out_lines.push(DiffLine {
                    kind: DiffKind::OcrExtra,
                    index: i,
                    sent: None,
                    seen: g,
                    char_diffs: 0,
                });
            }
            (Some(_), Some(_)) => {
                let (diffs, compared) =
                    count_char_diffs(s.as_deref().unwrap_or(""), g.as_deref().unwrap_or(""));
                total_chars += compared;
                char_mismatches += diffs;
                let line_ok = diffs == 0;
                if line_ok {
                    line_matches += 1;
                }
                out_lines.push(DiffLine {
                    kind: if line_ok {
                        DiffKind::Match
                    } else {
                        DiffKind::Mismatch
                    },
                    index: i,
                    sent: s,
                    seen: g,
                    char_diffs: diffs,
                });
            }
            (None, None) => {}
        }
    }

    let aligned = pairs
        .iter()
        .filter(|(a, b)| a.is_some() && b.is_some())
        .count();
    let stats = DiffStats {
        aligned_lines: aligned,
        matching_lines: line_matches,
        char_diffs: char_mismatches,
        total_chars,
        dropped: dropped_by_ocr,
        extra: hallucinated_by_ocr,
        sent_chars: sent.chars().count(),
        seen_chars: seen.chars().count(),
    };

    log::info!(
        "verify: aligned={} matches={} char_diffs={} total_chars={} accuracy={:.2}% dropped={} extra={}",
        stats.aligned_lines,
        stats.matching_lines,
        stats.char_diffs,
        stats.total_chars,
        stats.accuracy_pct(),
        stats.dropped,
        stats.extra
    );

    (stats, out_lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_diff_all_match_returns_100_percent() {
        let (stats, _) = compute_diff("line one\nline two", "line one\nline two");
        assert_eq!(stats.char_diffs, 0);
        assert!((stats.accuracy_pct() - 100.0).abs() < 0.001);
        assert_eq!(stats.aligned_lines, 2);
        assert_eq!(stats.matching_lines, 2);
    }

    #[test]
    fn compute_diff_single_char_mismatch() {
        let (stats, lines) = compute_diff("hello", "hallo");
        assert_eq!(stats.char_diffs, 1);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].kind, DiffKind::Mismatch);
        assert_eq!(lines[0].char_diffs, 1);
    }

    #[test]
    fn compute_diff_ocr_drop_isolated() {
        // OCR dropped the middle line.
        let sent = "alpha\nbeta\ngamma";
        let seen = "alpha\ngamma";
        let (stats, lines) = compute_diff(sent, seen);
        assert_eq!(stats.dropped, 1);
        assert!(lines.iter().any(|l| l.kind == DiffKind::OcrDrop));
    }

    #[test]
    fn compute_diff_ocr_extra() {
        let sent = "one";
        let seen = "one\nspurious";
        let (stats, _) = compute_diff(sent, seen);
        assert_eq!(stats.extra, 1);
    }

    #[test]
    fn compute_diff_empty_returns_100_percent() {
        let (stats, _) = compute_diff("", "");
        assert!((stats.accuracy_pct() - 100.0).abs() < 0.001);
    }
}
