// Pure chunk-grouping helpers for the v1 chunked send-and-verify UI (task 37).
// Mirrors Rust `typer_core::chunk_text` so frontend rendering and backend
// keystroke production agree on chunk boundaries.

export const CHUNK_SIZE_LINES = 5;

export type ChunkState = "untouched" | "inProgress" | "pass" | "fail" | "stopped";

/**
 * Split `text` by `\n` and group into chunks of `chunkSize` source lines.
 * Trailing partial chunk (fewer than chunkSize lines) is included.
 *
 * Matches Rust `.lines()` semantics: a trailing newline does NOT produce
 * an extra empty line. `"a\nb\n"` → `[["a", "b"]]`, not `[["a","b",""]]`.
 * Empty input returns `[]`.
 */
export function chunkText(text: string, chunkSize: number = CHUNK_SIZE_LINES): string[][] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  // Drop a single trailing empty entry if input ended with `\n`,
  // matching Rust's `text.lines()`.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0) return [];
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    out.push(lines.slice(i, i + chunkSize));
  }
  return out;
}

/** Map a 1-indexed source line number to its 0-indexed chunk index. */
export function lineToChunkIndex(
  line1Indexed: number,
  chunkSize: number = CHUNK_SIZE_LINES,
): number {
  return Math.floor((line1Indexed - 1) / chunkSize);
}

/**
 * Compute the chunk-state vector after a `sendCancelled` event (task 41).
 *
 * Backend's `atChunk` may point to a chunk that never started (cancel fired
 * between chunks). When that's the case, fall back to the most recent
 * in-flight or fail chunk so the visible "stopped" marker lands on a chunk
 * the user can see. Defensively also reverts any `inProgress` at indices
 * > stoppedIdx back to `untouched`.
 */
export function applySendCancelled(
  states: ChunkState[],
  atChunk: number,
): { next: ChunkState[]; stoppedIdx: number } {
  const next = [...states];
  let stoppedIdx = atChunk;
  const candidate = next[atChunk];
  if (candidate !== "inProgress" && candidate !== "fail") {
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (s === "inProgress" || s === "fail") {
        stoppedIdx = i;
        break;
      }
    }
  }
  if (stoppedIdx >= 0 && stoppedIdx < next.length) {
    next[stoppedIdx] = "stopped";
  }
  for (let i = stoppedIdx + 1; i < next.length; i++) {
    if (next[i] === "inProgress") next[i] = "untouched";
  }
  return { next, stoppedIdx };
}
