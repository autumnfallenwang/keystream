// Status text shown in the main header status line during send/pause/
// done/stopped. Pure formatting helper.

import type { AppState } from "./app-state";

export type ProgressInputs = {
  state: AppState;
  /** Total chars in the source text. The state's snapshot may not have
   * this populated for all modes, so we get it from the page directly. */
  totalChars: number;
};

const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtSecs = (ms: number) => (ms / 1000).toFixed(1);

/**
 * Returns the status string for the current state, or `null` when there
 * is no status to show (idle / countdown / settings — those modes use
 * the gate strip instead).
 */
export function computeStatusText(inputs: ProgressInputs): string | null {
  const { state, totalChars } = inputs;
  switch (state.mode) {
    case "sending":
      return `Typing ${fmtNum(state.charsTyped)} / ${fmtNum(totalChars)} chars`;
    case "paused":
      return `⏸ Paused at ${fmtNum(state.charsTyped)} / ${fmtNum(state.totalChars)} chars · ${fmtSecs(state.durationMs)}s`;
    case "done":
      return `✓ Done · ${fmtNum(state.chars)} chars · ${fmtSecs(state.durationMs)}s`;
    case "stopped":
      return `⏹ Stopped at ${fmtNum(state.charsTyped)} / ${fmtNum(state.totalChars)} chars`;
    default:
      return null;
  }
}
