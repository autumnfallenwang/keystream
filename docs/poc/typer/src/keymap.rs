// US ANSI layout char -> (macOS virtual keycode, needs_shift)
// Source: Carbon HIToolbox Events.h
pub fn char_to_keycode(ch: char) -> Option<(u16, bool)> {
    Some(match ch {
        // letters
        'a' => (0, false), 'A' => (0, true),
        's' => (1, false), 'S' => (1, true),
        'd' => (2, false), 'D' => (2, true),
        'f' => (3, false), 'F' => (3, true),
        'h' => (4, false), 'H' => (4, true),
        'g' => (5, false), 'G' => (5, true),
        'z' => (6, false), 'Z' => (6, true),
        'x' => (7, false), 'X' => (7, true),
        'c' => (8, false), 'C' => (8, true),
        'v' => (9, false), 'V' => (9, true),
        'b' => (11, false), 'B' => (11, true),
        'q' => (12, false), 'Q' => (12, true),
        'w' => (13, false), 'W' => (13, true),
        'e' => (14, false), 'E' => (14, true),
        'r' => (15, false), 'R' => (15, true),
        'y' => (16, false), 'Y' => (16, true),
        't' => (17, false), 'T' => (17, true),
        'o' => (31, false), 'O' => (31, true),
        'u' => (32, false), 'U' => (32, true),
        'i' => (34, false), 'I' => (34, true),
        'p' => (35, false), 'P' => (35, true),
        'l' => (37, false), 'L' => (37, true),
        'j' => (38, false), 'J' => (38, true),
        'k' => (40, false), 'K' => (40, true),
        'n' => (45, false), 'N' => (45, true),
        'm' => (46, false), 'M' => (46, true),

        // digits (top row) and their shifted symbols
        '1' => (18, false), '!' => (18, true),
        '2' => (19, false), '@' => (19, true),
        '3' => (20, false), '#' => (20, true),
        '4' => (21, false), '$' => (21, true),
        '5' => (23, false), '%' => (23, true),
        '6' => (22, false), '^' => (22, true),
        '7' => (26, false), '&' => (26, true),
        '8' => (28, false), '*' => (28, true),
        '9' => (25, false), '(' => (25, true),
        '0' => (29, false), ')' => (29, true),

        // punctuation
        '-' => (27, false), '_' => (27, true),
        '=' => (24, false), '+' => (24, true),
        '[' => (33, false), '{' => (33, true),
        ']' => (30, false), '}' => (30, true),
        '\\' => (42, false), '|' => (42, true),
        ';' => (41, false), ':' => (41, true),
        '\'' => (39, false), '"' => (39, true),
        ',' => (43, false), '<' => (43, true),
        '.' => (47, false), '>' => (47, true),
        '/' => (44, false), '?' => (44, true),
        '`' => (50, false), '~' => (50, true),

        // whitespace / control
        ' ' => (49, false),
        '\t' => (48, false),

        _ => return None,
    })
}

pub const KEYCODE_RETURN: u16 = 36;
pub const KEYCODE_SHIFT: u16 = 56; // left shift
pub const KEYCODE_CONTROL: u16 = 59; // left control
#[allow(dead_code)] pub const KEYCODE_DELETE: u16 = 51; // backspace / delete-back
#[allow(dead_code)] pub const KEYCODE_FORWARD_DELETE: u16 = 117; // forward delete
#[allow(dead_code)] pub const KEYCODE_A: u16 = 0;
#[allow(dead_code)] pub const KEYCODE_HOME: u16 = 115;
#[allow(dead_code)] pub const KEYCODE_END: u16 = 119;
pub const KEYCODE_PAGE_DOWN: u16 = 121;
pub const KEYCODE_PAGE_UP: u16 = 116;
