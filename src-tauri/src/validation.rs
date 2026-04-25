//! Argument validation for Tauri commands. Per rules/security.md:
//! "Every #[tauri::command] handler must validate its arguments.
//! Frontend is not trustworthy."
//!
//! v1 enforces conservative size caps on string and Vec<String>
//! arguments to prevent runaway frontends from OOM-ing the backend
//! with multi-GB IPC payloads.

/// Maximum byte size for any user-provided text argument. 1 MiB. The
/// PoC corpus is ~1KB; v1 typical sends are a few KB. 1 MiB is far
/// beyond any realistic v1 input — pathological payloads get a clean
/// error message instead of OOMing the backend.
pub const MAX_TEXT_BYTES: usize = 1_048_576;

/// Maximum number of lines in a `Vec<String>` argument. Defensive
/// cap; the real defense is `MAX_TEXT_BYTES` on total size.
pub const MAX_LINES: usize = 100_000;

/// Validate that a single text argument fits inside the byte cap.
/// Uses `str::len()` (byte count, not char count) so unicode-heavy
/// payloads are bounded by their wire size.
pub fn validate_text_size(text: &str, label: &str) -> Result<(), String> {
    if text.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "{label} too large: {} bytes (max {MAX_TEXT_BYTES})",
            text.len()
        ));
    }
    Ok(())
}

/// Validate a `Vec<String>` argument: total line count and aggregate
/// byte size both within bounds.
pub fn validate_lines_size(lines: &[String], label: &str) -> Result<(), String> {
    if lines.len() > MAX_LINES {
        return Err(format!(
            "{label} has too many lines: {} (max {MAX_LINES})",
            lines.len()
        ));
    }
    let total: usize = lines.iter().map(|l| l.len()).sum();
    if total > MAX_TEXT_BYTES {
        return Err(format!(
            "{label} total size too large: {total} bytes (max {MAX_TEXT_BYTES})"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_text_size_accepts_under_limit() {
        assert!(validate_text_size("hello", "text").is_ok());
        assert!(validate_text_size(&"a".repeat(MAX_TEXT_BYTES), "text").is_ok());
    }

    #[test]
    fn validate_text_size_rejects_over_limit() {
        let big = "a".repeat(MAX_TEXT_BYTES + 1);
        assert!(validate_text_size(&big, "text").is_err());
    }

    #[test]
    fn validate_text_size_uses_byte_count_not_chars() {
        // 'é' is 2 bytes UTF-8. (MAX_TEXT_BYTES/2 + 1) chars = MAX_TEXT_BYTES+2 bytes
        // → reject. Confirms we measure wire size, not visible-char count.
        let chars = MAX_TEXT_BYTES / 2 + 1;
        let big = "é".repeat(chars);
        assert!(big.len() > MAX_TEXT_BYTES);
        assert!(validate_text_size(&big, "text").is_err());
    }

    #[test]
    fn validate_lines_size_rejects_too_many_lines() {
        let lines: Vec<String> = (0..MAX_LINES + 1).map(|_| "x".to_string()).collect();
        assert!(validate_lines_size(&lines, "expected").is_err());
    }

    #[test]
    fn validate_lines_size_rejects_too_large_total() {
        // 200 lines × 5500 bytes each ≈ 1.05 MiB total → reject on total bytes.
        let lines: Vec<String> = (0..200).map(|_| "a".repeat(5500)).collect();
        assert!(validate_lines_size(&lines, "expected").is_err());
    }

    #[test]
    fn validate_lines_size_accepts_normal_chunk() {
        let lines: Vec<String> = ["line1", "line2", "line3", "line4", "line5"]
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        assert!(validate_lines_size(&lines, "expected").is_ok());
    }
}
