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
    fn folds_close_angle_to_guillemet_class() {
        // Vision sometimes reads `>` as `›` (U+203A), same pattern as `<` → `‹`.
        assert_eq!(fold_char('>'), '>');
        assert_eq!(fold_char('›'), '>');
    }

    #[test]
    fn folds_double_quote_variants() {
        // Vision renders ASCII `"` as smart quotes in some fonts / contexts.
        // U+201C LEFT DOUBLE QUOTATION MARK, U+201D RIGHT. Both fold back
        // to ASCII `"` so sent-vs-seen comparisons don't flag typing errors
        // when the VM displays the right char but OCR reads a curly.
        assert_eq!(fold_char('"'), '"');
        assert_eq!(fold_char('\u{201C}'), '"');
        assert_eq!(fold_char('\u{201D}'), '"');
    }

    #[test]
    fn letters_case_fold_but_do_not_reach_lookalike_class() {
        // 'l' stays 'l', 'I' becomes 'i' via case fold (not via 1/l/I/i arm).
        assert_eq!(fold_char('l'), 'l');
        assert_eq!(fold_char('I'), 'i');
    }

    #[test]
    fn unmapped_char_identity() {
        // Chars not in any fold class pass through unchanged: digits that
        // aren't in a lookalike class, whitespace, any non-ASCII char.
        assert_eq!(fold_char('3'), '3');
        assert_eq!(fold_char(' '), ' ');
        assert_eq!(fold_char('\t'), '\t');
        assert_eq!(fold_char('é'), 'é');
    }

    #[test]
    fn fold_line_is_composition() {
        // Hello -> hello (case fold only; letters don't cross to digit class).
        assert_eq!(fold_line("Hello"), "hello");
    }
}
