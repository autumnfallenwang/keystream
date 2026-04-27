// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See .claude/rules/conventions.md "Import conventions".
//
// A future web version replaces this file with src/lib/api.ts (REST client)
// and every React component keeps working.

import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Permissions, Region } from "@/lib/core/gates";

export type { Permissions } from "@/lib/core/gates";

// ---------------------------------------------------------------------------
// Event bus (Rust → webview)
// ---------------------------------------------------------------------------

/**
 * Subscribe to a named Tauri event. Returns an `UnlistenFn` the caller must
 * invoke on cleanup (React components should call it from useEffect cleanup).
 * Wraps `@tauri-apps/api/event.listen` so components don't have to import it
 * directly (enforced by biome `noRestrictedImports`).
 */
export async function listenTauriEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return await listen<T>(event, (e) => handler(e.payload));
}

// ---------------------------------------------------------------------------
// Logging (webview → Rust → JSON file + stdout in dev)
// ---------------------------------------------------------------------------

/** Log a frontend event at INFO level. */
export async function log(message: string): Promise<void> {
  await invoke("log_info", { message });
}

/** Log a frontend event at WARN level. Reserve for unexpected-but-recoverable. */
export async function logWarning(message: string): Promise<void> {
  await invoke("log_warn", { message });
}

/** Log a frontend event at ERROR level. Something broke the user will notice. */
export async function logErr(message: string): Promise<void> {
  await invoke("log_error", { message });
}

/** Pop the log directory in Finder/Explorer. Used in Settings → Help for bug reports. */
export async function openLogDir(): Promise<void> {
  await invoke("open_log_dir");
}

// ---------------------------------------------------------------------------
// File loading (dialog plugin → Rust read_text_file)
// ---------------------------------------------------------------------------

const TEXT_FILE_EXTENSIONS = [
  "txt",
  "md",
  "log",
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "json",
  "yml",
  "yaml",
  "toml",
];

export type PickedFile = { path: string; name: string };

/**
 * Open the OS file picker for a single text file. Returns the picked path
 * and its basename, or null if the user cancelled. The path is what the
 * OS handed back; the caller passes it to `readTextFile`.
 */
export async function pickTextFile(): Promise<PickedFile | null> {
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "Text", extensions: TEXT_FILE_EXTENSIONS }],
  });
  if (picked === null || typeof picked !== "string") {
    return null;
  }
  const name = picked.split(/[\\/]/).pop() ?? picked;
  return { path: picked, name };
}

/**
 * Load the contents of a text file at `path`. Backed by the
 * `read_text_file` Tauri command — canonicalizes, asserts regular file,
 * caps at 1 MiB, validates UTF-8.
 */
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("read_text_file", { path });
}

// ---------------------------------------------------------------------------
// Region calibration (region_picker sidecar → Rust calibrate / get_region)
// ---------------------------------------------------------------------------

/**
 * Spawn the `region_picker` sidecar, wait for the user to drag a rectangle,
 * persist the region to the app data dir, and return it. Throws on sidecar
 * failure or user cancel.
 */
export async function calibrate(): Promise<Region> {
  return await invoke<Region>("calibrate");
}

/**
 * Read the saved region from the app data dir. Returns `null` if none has
 * been saved yet (normal state on first launch).
 */
export async function getRegion(): Promise<Region | null> {
  return await invoke<Region | null>("get_region");
}

/** Idempotent delete of the saved region. */
export async function clearRegion(): Promise<void> {
  await invoke("clear_region");
}

// ---------------------------------------------------------------------------
// Line-length pre-check (Q8) — Rust check_lines command
// ---------------------------------------------------------------------------

export type OffendingLine = { line: number; length: number };
export type CheckLinesResult = { ok: boolean; offending: OffendingLine[] };

/**
 * Run the Q8 line-length pre-check against the given text. Backend hardcodes
 * `MAX_LINE_CHARS` from `typer_core::config` (80). Returns `{ ok, offending }`
 * with 1-indexed line numbers and Unicode-character lengths.
 */
export async function checkLines(text: string): Promise<CheckLinesResult> {
  return await invoke<CheckLinesResult>("check_lines", { text });
}

// ---------------------------------------------------------------------------
// Chunked send-and-verify (Q7/Q9 loop) — typed Channel<SendEvent>
// ---------------------------------------------------------------------------

export type DiffKind = "Match" | "Mismatch" | "OcrDrop" | "OcrExtra";

export type DiffLine = {
  kind: DiffKind;
  index: number;
  sent: string | null;
  seen: string | null;
  charDiffs: number;
};

export type DiffStats = {
  alignedLines: number;
  matchingLines: number;
  charDiffs: number;
  totalChars: number;
  dropped: number;
  extra: number;
  sentChars: number;
  seenChars: number;
};

export type SendEvent =
  | { event: "chunkStart"; data: { index: number; total: number; lines: string[] } }
  | { event: "chunkPass"; data: { index: number } }
  | { event: "chunkFail"; data: { index: number; stats: DiffStats; diff: DiffLine[] } }
  | {
      event: "sendComplete";
      data: { total: number; passed: number; failed: number; skipped: number };
    }
  | { event: "sendCancelled"; data: { atChunk: number } };

export type ContinueAction = "skip" | "stop" | "retry";

/**
 * Construct a `Channel<SendEvent>` with the supplied handler wired to
 * `onmessage`. Returned channel is passed to `sendWithChunkedVerify` as the
 * `onEvent` argument. Hides Tauri's Channel constructor from the page.
 */
export function createSendChannel(handler: (event: SendEvent) => void): Channel<SendEvent> {
  const channel = new Channel<SendEvent>();
  channel.onmessage = handler;
  return channel;
}

/**
 * Drive the Q7/Q9 chunked send-and-verify loop. The backend streams
 * `SendEvent` payloads via `channel`; the promise resolves when the run
 * ends (complete / cancelled) or rejects on hard failure.
 */
export async function sendWithChunkedVerify(
  text: string,
  channel: Channel<SendEvent>,
): Promise<void> {
  await invoke("send_with_chunked_verify", { text, onEvent: channel });
}

/** Ack a chunk-fail decision: skip / stop / retry (Q10). */
export async function continueAfterFail(action: ContinueAction): Promise<void> {
  await invoke("continue_after_fail", { action });
}

/** Cooperative cancel: flips the backend's atomic flag; the loop exits at
 * the next chunk boundary, emitting `sendCancelled`. */
export async function stopSend(): Promise<void> {
  await invoke("stop_send");
}

// ---------------------------------------------------------------------------
// macOS permission probe + System Settings deep-link (task 42)
// ---------------------------------------------------------------------------

export type SettingsPane = "accessibility" | "screenRecording";

/** Silent probe of Accessibility + Screen Recording grants. No prompt. */
export async function checkPermissions(): Promise<Permissions> {
  return await invoke<Permissions>("check_permissions");
}

/** Open the System Settings pane for the named privacy section. */
export async function openSettingsPane(pane: SettingsPane): Promise<void> {
  await invoke("open_settings_pane", { pane });
}

// ---------------------------------------------------------------------------
// Text persistence (task 43) — last-loaded text survives app relaunch.
// ---------------------------------------------------------------------------

/** Persist text to the app data dir. Validated server-side at MAX_TEXT_BYTES. */
export async function saveText(text: string): Promise<void> {
  await invoke("save_text", { text });
}

/** Restore previously-saved text. Returns null when none has been saved. */
export async function getText(): Promise<string | null> {
  return await invoke<string | null>("get_text");
}

/** Idempotent delete of the saved text. */
export async function clearText(): Promise<void> {
  await invoke("clear_text");
}
