//! Pre-send line-length check (locked decision Q8). Before Send is
//! enabled, every source line in the input is checked against
//! `MAX_LINE_CHARS` (80). Longer lines would force AVD horizontal
//! scroll, which v1 does not support.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct OffendingLine {
    /// 1-indexed line number (user-facing).
    pub line: usize,
    /// Unicode character count (not byte count).
    pub length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckLinesResult {
    pub ok: bool,
    pub offending: Vec<OffendingLine>,
}

/// Check every source line (split on `\n`, handles `\r\n`) against
/// `max_chars`. Returns the list of offending lines with 1-indexed
/// line numbers and Unicode character lengths. `ok = offending.is_empty()`.
pub fn check_lines(text: &str, max_chars: usize) -> CheckLinesResult {
    let offending: Vec<OffendingLine> = text
        .lines()
        .enumerate()
        .filter_map(|(i, line)| {
            let length = line.chars().count();
            if length > max_chars {
                Some(OffendingLine {
                    line: i + 1,
                    length,
                })
            } else {
                None
            }
        })
        .collect();

    CheckLinesResult {
        ok: offending.is_empty(),
        offending,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_MAX: usize = 80;

    #[test]
    fn empty_text_is_ok() {
        let r = check_lines("", TEST_MAX);
        assert!(r.ok);
        assert!(r.offending.is_empty());
    }

    #[test]
    fn short_lines_all_ok() {
        let r = check_lines("hello\nworld\nthird", TEST_MAX);
        assert!(r.ok);
        assert!(r.offending.is_empty());
    }

    #[test]
    fn single_long_line_is_offending() {
        let long = "a".repeat(100);
        let r = check_lines(&long, TEST_MAX);
        assert!(!r.ok);
        assert_eq!(r.offending.len(), 1);
        assert_eq!(r.offending[0].line, 1);
        assert_eq!(r.offending[0].length, 100);
    }

    #[test]
    fn multiple_long_lines_reported_with_1_indexed_numbers() {
        let text = format!("short\n{}\nshort\n{}\n", "a".repeat(85), "b".repeat(90));
        let r = check_lines(&text, TEST_MAX);
        assert!(!r.ok);
        assert_eq!(r.offending.len(), 2);
        assert_eq!(r.offending[0].line, 2);
        assert_eq!(r.offending[0].length, 85);
        assert_eq!(r.offending[1].line, 4);
        assert_eq!(r.offending[1].length, 90);
    }

    #[test]
    fn line_length_counts_unicode_chars_not_bytes() {
        // 'é' is 2 bytes in UTF-8 but 1 Unicode char. A line of 81 'é'
        // is 81 chars (fails) but 162 bytes.
        let text = "é".repeat(81);
        let r = check_lines(&text, TEST_MAX);
        assert!(!r.ok);
        assert_eq!(r.offending[0].length, 81);
    }

    #[test]
    fn blank_lines_and_empty_lines_pass() {
        let r = check_lines("\n\n   \n\t\n", TEST_MAX);
        assert!(r.ok);
    }

    #[test]
    fn exact_threshold_line_passes() {
        let line = "a".repeat(80);
        let r = check_lines(&line, TEST_MAX);
        assert!(
            r.ok,
            "exactly-80-char line must pass since check is > not >="
        );
    }

    #[test]
    fn one_char_over_fails() {
        let line = "a".repeat(81);
        let r = check_lines(&line, TEST_MAX);
        assert!(!r.ok);
        assert_eq!(r.offending[0].length, 81);
    }

    #[test]
    fn crlf_endings_handled() {
        let text = format!("short\r\n{}\r\nshort", "a".repeat(85));
        let r = check_lines(&text, TEST_MAX);
        assert!(!r.ok);
        assert_eq!(r.offending.len(), 1);
        assert_eq!(r.offending[0].line, 2);
    }
}
