// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See .claude/rules/conventions.md "Import conventions".

import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// ---------------------------------------------------------------------------
// Event bus (Rust → webview)
// ---------------------------------------------------------------------------

/**
 * Subscribe to a named Tauri event. Returns an `UnlistenFn` the caller must
 * invoke on cleanup (React components should call it from useEffect cleanup).
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

export type PickedFile = { path: string; name: string };

/**
 * Open the OS file picker for any file. Q20 — no extension filter:
 * the user can pick anything, and the UTF-8 / size check happens at
 * read time. Binary picks surface a friendly warning view rather
 * than being hidden by the OS dialog.
 */
export async function pickTextFile(): Promise<PickedFile | null> {
  const picked = await openDialog({
    multiple: false,
    directory: false,
  });
  if (picked === null || typeof picked !== "string") {
    return null;
  }
  const name = picked.split(/[\\/]/).pop() ?? picked;
  return { path: picked, name };
}

/** Load the contents of a text file at `path`. Backend canonicalises and
 * caps at 1 MiB. */
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("read_text_file", { path });
}

// ---------------------------------------------------------------------------
// File explorer (Q18 — Phase v2-8)
// ---------------------------------------------------------------------------

import type { FolderTree } from "@/lib/core/file-tree";

export type { FolderTree, TreeNode } from "@/lib/core/file-tree";

/** Open the OS folder picker. Returns the picked absolute path, or
 * null on cancel. */
export async function pickFolder(): Promise<string | null> {
  const picked = await openDialog({ multiple: false, directory: true });
  if (picked === null || typeof picked !== "string") {
    return null;
  }
  return picked;
}

/** Read a folder's tree (depth ≤ 6, ≤500 nodes/folder, hidden names
 * filtered server-side). */
export async function readFolderTree(path: string): Promise<FolderTree> {
  return await invoke<FolderTree>("read_folder_tree", { path });
}

/** Ephemeral session state — last folder, selected file, expanded
 * paths. Sibling to `Settings`. */
export type AppStateCfg = {
  lastFolder: string | null;
  selectedFile: string | null;
  expandedPaths: string[];
};

/** Read the persisted explorer state. Returns defaults on first launch. */
export async function getAppState(): Promise<AppStateCfg> {
  return await invoke<AppStateCfg>("get_state");
}

/** Persist the explorer state to <app_data_dir>/state.json. */
export async function saveAppState(cfg: AppStateCfg): Promise<void> {
  await invoke("save_state", { cfg });
}

// ---------------------------------------------------------------------------
// Text persistence
// ---------------------------------------------------------------------------

/** Persist text to the app data dir. */
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

// ---------------------------------------------------------------------------
// macOS permissions probe + System Settings deep-link
// ---------------------------------------------------------------------------

export type Permissions = { accessibility: boolean };

/** v2 only allows "accessibility"; backend rejects everything else. */
export type SettingsPane = "accessibility";

/** Silent probe of the Accessibility grant. No prompt. */
export async function checkPermissions(): Promise<Permissions> {
  return await invoke<Permissions>("check_permissions");
}

/** Open the System Settings pane for the named privacy section. */
export async function openSettingsPane(pane: SettingsPane): Promise<void> {
  await invoke("open_settings_pane", { pane });
}

// ---------------------------------------------------------------------------
// User settings (Q13 four-dial config + Q15 appearance shell)
// ---------------------------------------------------------------------------

import type { AppearanceCfg } from "@/lib/core/appearance";

export type Settings = {
  eventPauseMs: number;
  modHoldMs: number;
  warmupShift: boolean;
  countdownSecs: number;
  appearance: AppearanceCfg;
  sidebarWidthPx: number;
};

/** Read settings from disk. Returns defaults on first launch (file missing). */
export async function getSettings(): Promise<Settings> {
  return await invoke<Settings>("get_settings");
}

/** Write settings to disk. Backend persists to <app_data_dir>/settings.json. */
export async function saveSettings(cfg: Settings): Promise<void> {
  await invoke("save_settings", { cfg });
}

// ---------------------------------------------------------------------------
// Send pipeline (Q14 tri-verb surface)
// ---------------------------------------------------------------------------

export type SendEvent =
  | {
      event: "sendProgress";
      data: { charsTyped: number };
    }
  | {
      event: "sendComplete";
      data: { charsTyped: number; skipped: number; durationMs: number };
    }
  | {
      event: "sendPaused";
      data: { position: number; charsTyped: number; durationMs: number };
    }
  | {
      event: "sendStopped";
      data: { position: number; charsTyped: number; durationMs: number };
    };

/** Construct a `Channel<SendEvent>` with the supplied handler wired. */
export function createSendChannel(handler: (event: SendEvent) => void): Channel<SendEvent> {
  const channel = new Channel<SendEvent>();
  channel.onmessage = handler;
  return channel;
}

/**
 * Drive the v2 linear send loop. The backend types `text` into the focused
 * editor starting from `startOffset` (a char index). On exit the backend
 * emits exactly one `SendEvent` (sendComplete / sendPaused / sendStopped)
 * via the channel and resolves the promise.
 *
 * Resume is just another `runSend` call with `startOffset = position` from
 * the previous SendPaused event.
 */
export async function runSend(
  text: string,
  cfg: Settings,
  startOffset: number,
  channel: Channel<SendEvent>,
): Promise<void> {
  await invoke("run_send", { text, cfg, startOffset, onEvent: channel });
}

/** Cooperative pause: flips the backend's control flag to PauseRequested.
 * The send loop halts at the next char boundary and emits SendPaused. */
export async function pauseSend(): Promise<void> {
  await invoke("pause_send");
}

/** Cooperative stop: flips the backend's control flag to StopRequested.
 * The send loop halts and the frontend resets to position 0. */
export async function stopSend(): Promise<void> {
  await invoke("stop_send");
}
