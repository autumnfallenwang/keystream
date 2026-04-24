//! Character-level fold table for OCR confusions. Applied to BOTH sides
//! before diff compare (locked decision Q4 / conventions.md "OCR tolerance").
//!
//! When adding a new fold entry, include a comment citing the specific OCR
//! failure (what was on screen vs what Vision read, corpus+line, and ideally
//! a reproducible capture under `docs/poc/results/`).

/// Fold a single char into its canonical form.
pub fn fold_char(c: char) -> char {
    match c {
        // backtick <-> apostrophe: Vision reads ` as ' on monospace fonts
        '`' | '\'' => '\'',
        // angle brackets vs guillemets: Vision reads < as ‹ at small font sizes
        '<' | '‹' => '<',
        '>' | '›' => '>',
        // double-quote variants: Vision reads " as smart quotes
        '"' | '\u{201C}' | '\u{201D}' => '"',
        // case-fold letters: Vision flips case on some chars (User -> user, URL -> uRL)
        c if c.is_ascii_alphabetic() => c.to_ascii_lowercase(),
        // digit/letter lookalikes: Vision swaps 0/O/o and 1/l/I/i routinely
        '0' | 'O' | 'o' => 'o',
        '1' | 'l' | 'I' | 'i' => 'i',
        c => c,
    }
}

pub fn fold_line(s: &str) -> String {
    s.chars().map(fold_char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_backtick_to_apostrophe() {
        assert_eq!(fold_char('`'), '\'');
        assert_eq!(fold_char('\''), '\'');
    }

    #[test]
    fn folds_angle_to_guillemet_class() {
        assert_eq!(fold_char('<'), '<');
        assert_eq!(fold_char('‹'), '<');
    }

    #[test]
    fn folds_case() {
        assert_eq!(fold_char('A'), 'a');
        assert_eq!(fold_char('z'), 'z');
    }

    #[test]
    fn folds_zero_o_class() {
        assert_eq!(fold_char('0'), 'o');
        assert_eq!(fold_char('O'), 'o');
        assert_eq!(fold_char('o'), 'o');
    }

    #[test]
    fn folds_digit_one_to_i() {
        // Only digit 1 reaches the 1/l/I/i arm — letters are caught by the
        // is_ascii_alphabetic arm first and stay letters after case fold.
        // This mirrors the PoC behavior at docs/poc/typer/src/main.rs:520.
        assert_eq!(fold_char('1'), 'i');
    }

    #[test]
    fn folds_digit_zero_to_o() {
        // Same as above: 'O' and 'o' are already handled by alphabetic fold;
        // only '0' reaches this arm in practice.
        assert_eq!(fold_char('0'), 'o');
    }

    #[test]
    fn letters_case_fold_but_do_not_reach_lookalike_class() {
        // 'l' stays 'l', 'I' becomes 'i' via case fold (not via 1/l/I/i arm).
        assert_eq!(fold_char('l'), 'l');
        assert_eq!(fold_char('I'), 'i');
    }

    #[test]
    fn fold_line_is_composition() {
        // Hello -> hello (case fold only; letters don't cross to digit class).
        assert_eq!(fold_line("Hello"), "hello");
    }
}
