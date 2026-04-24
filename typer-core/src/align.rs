//! LCS-based line alignment (locked decision Q6). OCR drops certain lines
//! deterministically (blank lines, lines containing only `}` or `;`);
//! positional zip propagates one drop into every subsequent line. LCS
//! alignment isolates the drop to one row.

use crate::fold::fold_line;

/// LCS-based alignment. Returns pairs of `(sent_idx, seen_idx)` where
/// `None` means one side is missing (drop / insert). Folded equality used
/// for matching.
pub fn align_lines(a: &[String], b: &[String]) -> Vec<(Option<usize>, Option<usize>)> {
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
            i -= 1;
            j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            out.push((Some(i - 1), None));
            i -= 1;
        } else {
            out.push((None, Some(j - 1)));
            j -= 1;
        }
    }
    while i > 0 {
        out.push((Some(i - 1), None));
        i -= 1;
    }
    while j > 0 {
        out.push((None, Some(j - 1)));
        j -= 1;
    }
    out.reverse();
    out
}

/// Two folded lines are "the same line" if ≥70% of chars match at the same
/// position. Looser than strict equality so OCR typos don't break alignment.
pub fn lines_similar(a: &str, b: &str) -> bool {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let n = ac.len().max(bc.len());
    if n == 0 {
        return true;
    }
    let min_len = ac.len().min(bc.len());
    if min_len == 0 {
        return false;
    }
    let mut same = 0usize;
    for k in 0..min_len {
        if ac[k] == bc[k] {
            same += 1;
        }
    }
    (same as f64) / (n as f64) >= 0.7
}

/// Count char differences between two lines after folding. Aligns by
/// zipping; length mismatch counts as extra diffs.
pub fn count_char_diffs(a: &str, b: &str) -> (usize, usize) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lcs_handles_single_drop() {
        // OCR dropped the second (blank) line; LCS should isolate it as a drop,
        // not cascade the misalignment.
        let sent = vec![
            "line one".to_string(),
            "".to_string(),
            "line three".to_string(),
        ];
        let seen = vec!["line one".to_string(), "line three".to_string()];
        let pairs = align_lines(&sent, &seen);
        // Expect: 3 entries, with the empty-sent line matched against None
        assert_eq!(pairs.len(), 3);
        let drops: Vec<_> = pairs
            .iter()
            .filter(|(s, g)| s.is_some() && g.is_none())
            .collect();
        assert_eq!(drops.len(), 1);
    }

    #[test]
    fn lines_similar_exact() {
        assert!(lines_similar("hello", "hello"));
    }

    #[test]
    fn lines_similar_under_threshold_rejected() {
        assert!(!lines_similar("hello", "world"));
    }

    #[test]
    fn count_char_diffs_zero_for_equal() {
        let (d, _) = count_char_diffs("abc", "abc");
        assert_eq!(d, 0);
    }

    #[test]
    fn count_char_diffs_counts_mismatches() {
        let (d, n) = count_char_diffs("abc", "abd");
        assert_eq!(d, 1);
        assert_eq!(n, 3);
    }

    /// Regression test against the real PoC stress capture. Pins the
    /// specific alignment output for the committed `stress1_ocr.json`
    /// fixture so future changes to `align_lines`, `lines_similar`, or
    /// `fold_char` can't silently alter the sent-vs-seen shape.
    ///
    /// Covers `rules/testing.md` invariant #4: LCS alignment handles
    /// drops without cascading into every subsequent line looking like
    /// a mismatch.
    #[test]
    fn align_lines_against_stress1_ocr_isolates_drops() {
        let corpus = include_str!("../../docs/poc/samples/code_corpus.txt");
        let ocr_json = include_str!("../../docs/poc/results/stress1_ocr.json");

        // Minimal local shape so this test doesn't depend on ocr::OcrResponse.
        #[derive(serde::Deserialize)]
        struct Ocr {
            lines: Vec<OcrLine>,
        }
        #[derive(serde::Deserialize)]
        struct OcrLine {
            text: String,
        }

        let ocr: Ocr = serde_json::from_str(ocr_json).expect("parse stress1_ocr.json");

        // Same normalization compute_diff uses: strip leading whitespace
        // per line and drop blank lines. OCR eats indentation and
        // blanks deterministically; without this normalization the
        // alignment is noisier.
        let norm = |s: &str| -> Vec<String> {
            s.lines()
                .map(|l| l.trim_start().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        };
        let sent_lines: Vec<String> = norm(corpus);
        let seen_lines: Vec<String> = ocr
            .lines
            .into_iter()
            .map(|l| l.text.trim_start().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        assert_eq!(sent_lines.len(), 29, "normalized sent line count");
        assert_eq!(seen_lines.len(), 30, "normalized seen line count");

        let pairs = align_lines(&sent_lines, &seen_lines);

        let matched_count = pairs
            .iter()
            .filter(|(s, g)| s.is_some() && g.is_some())
            .count();
        let drops: Vec<usize> = pairs
            .iter()
            .filter_map(|(s, g)| match (s, g) {
                (Some(s), None) => Some(*s),
                _ => None,
            })
            .collect();
        let extras: Vec<usize> = pairs
            .iter()
            .filter_map(|(s, g)| match (s, g) {
                (None, Some(g)) => Some(*g),
                _ => None,
            })
            .collect();

        assert_eq!(pairs.len(), 34, "total aligned pairs");
        assert_eq!(matched_count, 25, "matched pairs");
        assert_eq!(drops, vec![10, 22, 26, 27], "drop sent positions");
        assert_eq!(extras, vec![10, 22, 26, 27, 28], "extra seen positions");

        // Invariant #4: alignment doesn't cascade. Every matched pair's
        // sent and seen indices stay within 3 of each other. A
        // positional-zip (cascade) regression would have this offset
        // grow monotonically after the first drop.
        for (s, g) in &pairs {
            if let (Some(s), Some(g)) = (s, g) {
                let drift = s.abs_diff(*g);
                assert!(
                    drift <= 3,
                    "matched pair (sent={s}, seen={g}) drifted by {drift} — cascade regression?"
                );
            }
        }
    }
}
