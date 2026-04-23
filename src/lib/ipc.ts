// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See .claude/rules/conventions.md "Import conventions".
//
// A future web version replaces this file with src/lib/api.ts (REST client)
// and every React component keeps working.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
