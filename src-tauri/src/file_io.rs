//! `read_text_file` Tauri command for the v1 file-load flow (task 33).
//! The frontend gets a path from the OS file dialog (`tauri-plugin-dialog`),
//! then calls this command to load the contents. Owning the read here gives
//! us validation that `tauri-plugin-fs` with a wildcard scope wouldn't.
//!
//! Defense-in-depth on a path the OS dialog already authorized:
//! - canonicalize (resolves symlinks, defeats `..` traversal)
//! - reject anything that isn't a regular file (no FIFOs, devices, dirs)
//! - cap read at `MAX_TEXT_BYTES + 1` so 1 MiB+ files surface a clean error
//! - validate UTF-8 — non-UTF-8 inputs aren't typeable as keystrokes anyway

use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::validation::MAX_TEXT_BYTES;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("could not resolve path: {e}"))?;

    let metadata = canonical
        .metadata()
        .map_err(|e| format!("could not stat file: {e}"))?;
    if !metadata.is_file() {
        return Err("path is not a regular file".to_string());
    }

    let mut file = File::open(&canonical).map_err(|e| format!("could not open file: {e}"))?;

    // Read one byte past the cap so we can detect oversize without slurping.
    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_TEXT_BYTES as u64) as usize);
    let limit = (MAX_TEXT_BYTES + 1) as u64;
    file.by_ref()
        .take(limit)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read failed: {e}"))?;
    if bytes.len() > MAX_TEXT_BYTES {
        return Err(format!("file too large: more than {MAX_TEXT_BYTES} bytes"));
    }

    let text = String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;

    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "<unknown>".to_string());
    log::info!(
        "read_text_file: name={name} bytes={} lines={}",
        text.len(),
        text.lines().count()
    );

    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("kstest_file_io_{name}"))
    }

    #[test]
    fn read_text_file_returns_content_on_normal_file() {
        let path = tmp("normal.txt");
        fs::write(&path, "hello\nworld\n").unwrap();
        let got = read_text_file(path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(got, "hello\nworld\n");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn read_text_file_returns_empty_string_on_empty_file() {
        let path = tmp("empty.txt");
        fs::write(&path, "").unwrap();
        let got = read_text_file(path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(got, "");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn read_text_file_errors_on_missing_file() {
        let path = tmp("definitely_does_not_exist.txt");
        let _ = fs::remove_file(&path);
        let err = read_text_file(path.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("resolve path"), "got: {err}");
    }

    #[test]
    fn read_text_file_errors_on_directory_path() {
        let dir = std::env::temp_dir();
        let err = read_text_file(dir.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("not a regular file"), "got: {err}");
    }

    #[test]
    fn read_text_file_errors_on_oversized_file() {
        let path = tmp("oversize.txt");
        let big = vec![b'a'; MAX_TEXT_BYTES + 1];
        fs::write(&path, &big).unwrap();
        let err = read_text_file(path.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("too large"), "got: {err}");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn read_text_file_errors_on_invalid_utf8() {
        let path = tmp("bad_utf8.txt");
        fs::write(&path, [0xFFu8, 0xFE, 0x00, 0xC3, 0x28]).unwrap();
        let err = read_text_file(path.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("UTF-8"), "got: {err}");
        let _ = fs::remove_file(&path);
    }
}
