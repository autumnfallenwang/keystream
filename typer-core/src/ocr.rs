//! OCR pipeline: shell out to `screencapture` for the calibrated region,
//! then to the Swift `ocr_helper` sidecar (Apple Vision, Q4), parse its
//! JSON output via a typed shape (per rules/security.md: never `Value`
//! traversal on external input).

use crate::error::{Result, TyperError};
use crate::region::Region;
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

/// Typed OCR response shape. `ocr_helper` emits
/// `{ "lines": [{ "text": "..." }, ...] }`. Additional per-line fields
/// (bbox, confidence) are tolerated and ignored.
#[derive(Debug, Deserialize)]
struct OcrResponse {
    lines: Vec<OcrLine>,
}

#[derive(Debug, Deserialize)]
struct OcrLine {
    text: String,
}

/// Capture the given region via `screencapture -x -R ...`, feed the PNG
/// to the `ocr_helper` sidecar at `ocr_bin`, and return the extracted
/// line texts (leading whitespace stripped, blank lines dropped).
pub fn capture_ocr_lines(ocr_bin: &Path, region: &Region) -> Result<Vec<String>> {
    let tmp = std::env::temp_dir().join("typer_core_capture.png");
    let region_arg = format!("{},{},{},{}", region.x, region.y, region.w, region.h);

    let status = Command::new("screencapture")
        .args([
            "-x",
            "-R",
            &region_arg,
            tmp.to_str().ok_or_else(|| TyperError::Io {
                path: tmp.display().to_string(),
                source: std::io::Error::new(std::io::ErrorKind::InvalidInput, "non-utf8 tmp path"),
            })?,
        ])
        .status()
        .map_err(|e| TyperError::CommandSpawn {
            cmd: "screencapture".to_string(),
            reason: e.to_string(),
        })?;

    if !status.success() {
        return Err(TyperError::CommandNonZero {
            cmd: "screencapture".to_string(),
            status: status.code().map_or("signal".into(), |c| c.to_string()),
        });
    }

    let out = Command::new(ocr_bin)
        .arg(&tmp)
        .output()
        .map_err(|e| TyperError::CommandSpawn {
            cmd: ocr_bin.display().to_string(),
            reason: e.to_string(),
        })?;

    if !out.status.success() {
        return Err(TyperError::CommandNonZero {
            cmd: ocr_bin.display().to_string(),
            status: out.status.code().map_or("signal".into(), |c| c.to_string()),
        });
    }

    parse_ocr_json(&String::from_utf8_lossy(&out.stdout))
}

/// Parse OCR JSON into a vector of line texts. Leading whitespace
/// stripped, blank lines dropped (OCR leaves noise in both).
pub fn parse_ocr_json(json: &str) -> Result<Vec<String>> {
    let parsed: OcrResponse =
        serde_json::from_str(json).map_err(|e| TyperError::OcrMalformed(e.to_string()))?;
    Ok(parsed
        .lines
        .into_iter()
        .map(|l| l.text.trim_start().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ocr_json_extracts_texts() {
        let json = r#"{"lines":[{"text":"hello"},{"text":"world"}]}"#;
        let out = parse_ocr_json(json).unwrap();
        assert_eq!(out, vec!["hello".to_string(), "world".to_string()]);
    }

    #[test]
    fn parse_ocr_json_tolerates_extra_fields() {
        // ocr_helper's real output has bbox + confidence per line; we
        // only care about text.
        let json =
            r#"{"lines":[{"text":"one","width":100,"height":10,"x":0,"y":0,"confidence":0.99}]}"#;
        let out = parse_ocr_json(json).unwrap();
        assert_eq!(out, vec!["one".to_string()]);
    }

    #[test]
    fn parse_ocr_json_strips_leading_whitespace_and_blanks() {
        let json = r#"{"lines":[{"text":"  indented"},{"text":""},{"text":"  "},{"text":"end"}]}"#;
        let out = parse_ocr_json(json).unwrap();
        assert_eq!(out, vec!["indented".to_string(), "end".to_string()]);
    }

    #[test]
    fn parse_ocr_json_malformed_returns_error() {
        let err = parse_ocr_json("not json").unwrap_err();
        match err {
            TyperError::OcrMalformed(_) => {}
            other => panic!("expected OcrMalformed, got {other:?}"),
        }
    }

    #[test]
    fn parse_ocr_json_missing_lines_field_returns_error() {
        let err = parse_ocr_json(r#"{"other":"shape"}"#).unwrap_err();
        assert!(matches!(err, TyperError::OcrMalformed(_)));
    }
}
