//! Shift-drop pattern detector for poc2 experiments.
//!
//! Counts how many char-position diffs match the deterministic
//! "shift didn't make it" failure mode (sent shifted char, target
//! received its unshifted base).
//!
//! Reference: `docs/v2-direction.md` (live-AVD smoke insight, 2026-04-27).
//! Map below is US-ANSI-keyboard-specific.

/// Map from shifted char → its unshifted base (the char produced if the
/// shift modifier "didn't make it" through the RDP hop).
pub fn shift_drop_base(shifted: char) -> Option<char> {
    let b = match shifted {
        '!' => '1',
        '@' => '2',
        '#' => '3',
        '$' => '4',
        '%' => '5',
        '^' => '6',
        '&' => '7',
        '*' => '8',
        '(' => '9',
        ')' => '0',
        '_' => '-',
        '+' => '=',
        '{' => '[',
        '}' => ']',
        ':' => ';',
        '"' => '\'',
        '<' => ',',
        '>' => '.',
        '?' => '/',
        '~' => '`',
        '|' => '\\',
        c if c.is_ascii_uppercase() => c.to_ascii_lowercase(),
        _ => return None,
    };
    Some(b)
}

/// Compare two strings position-by-position; count positions where the
/// sent char is shifted and the seen char is its unshifted base.
///
/// Length mismatch counts only the overlapping prefix (zip semantics) —
/// good enough for our experiment metric. Real diff alignment is the
/// caller's job (typer-core does that).
pub fn count_shift_drops(sent: &str, seen: &str) -> usize {
    sent.chars()
        .zip(seen.chars())
        .filter(|(s, g)| shift_drop_base(*s).is_some_and(|base| base == *g))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_pairs_map_correctly() {
        assert_eq!(shift_drop_base('('), Some('9'));
        assert_eq!(shift_drop_base(')'), Some('0'));
        assert_eq!(shift_drop_base('Q'), Some('q'));
        assert_eq!(shift_drop_base(':'), Some(';'));
        assert_eq!(shift_drop_base('~'), Some('`'));
    }

    #[test]
    fn unshifted_chars_have_no_drop() {
        assert_eq!(shift_drop_base('9'), None);
        assert_eq!(shift_drop_base('a'), None);
        assert_eq!(shift_drop_base(';'), None);
    }

    #[test]
    fn count_zero_when_lines_equal() {
        assert_eq!(count_shift_drops("Hello, World!", "Hello, World!"), 0);
    }

    #[test]
    fn count_paren_drops() {
        assert_eq!(count_shift_drops("(foo)", "9foo0"), 2);
    }

    #[test]
    fn count_uppercase_drops() {
        assert_eq!(count_shift_drops("Quick", "quick"), 1);
    }

    #[test]
    fn ignores_unrelated_diffs() {
        assert_eq!(count_shift_drops("hello", "world"), 0);
    }

    #[test]
    fn ignores_ocr_noise_at_unshifted_positions() {
        // Sent ; saw . — that's an OCR confusion, not a shift-drop.
        assert_eq!(count_shift_drops("foo;", "foo."), 0);
    }
}
