// Pure state machine for the v2 page. No Tauri / React imports — the
// reducer is a pure function, fully unit-testable.
//
// Drives the modes laid out in docs/v2-frontend-design.md "State machine"
// and Q14: Send / Pause / Resume / Stop.

export type AppState =
  | { mode: "idle" }
  | {
      mode: "countdown";
      remaining: number;
      intent: "send" | "resume";
      resumeOffset: number;
    }
  | { mode: "sending"; charsTyped: number; totalChars: number; startedAtMs: number }
  | {
      mode: "paused";
      position: number;
      charsTyped: number;
      totalChars: number;
      durationMs: number;
    }
  | { mode: "stopped"; charsTyped: number; totalChars: number; durationMs: number }
  | { mode: "done"; chars: number; skipped: number; durationMs: number }
  | { mode: "settings" };

export type AppEvent =
  | { kind: "sendClicked"; totalChars: number }
  | { kind: "resumeClicked" }
  | { kind: "pauseClicked" }
  | { kind: "stopClicked" }
  | { kind: "countdownTick" }
  | { kind: "countdownFire"; nowMs: number }
  | { kind: "countdownCancelled" }
  | { kind: "ipcSendComplete"; chars: number; skipped: number; durationMs: number }
  | { kind: "ipcSendPaused"; position: number; charsTyped: number; durationMs: number }
  | { kind: "ipcSendStopped"; position: number; charsTyped: number; durationMs: number }
  | { kind: "doneTimeout" }
  | { kind: "openSettings" }
  | { kind: "closeSettings" };

export const COUNTDOWN_SECS = 3;

/** Pure reducer. Returns `state` unchanged when the event isn't legal in
 * the current mode (the page-level handler logs the no-op). */
export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.kind) {
    case "sendClicked":
      if (state.mode === "idle" || state.mode === "done" || state.mode === "stopped") {
        return {
          mode: "countdown",
          remaining: COUNTDOWN_SECS,
          intent: "send",
          resumeOffset: 0,
        };
      }
      return state;

    case "resumeClicked":
      if (state.mode === "paused") {
        return {
          mode: "countdown",
          remaining: COUNTDOWN_SECS,
          intent: "resume",
          resumeOffset: state.position,
        };
      }
      return state;

    case "pauseClicked":
      // No state change here — the IPC pause is fire-and-forget. The
      // backend will respond with ipcSendPaused which transitions us.
      return state;

    case "stopClicked":
      // From sending: backend will respond with ipcSendStopped.
      // From paused: no loop running, transition straight to stopped.
      // From countdown: cancel.
      if (state.mode === "paused") {
        return {
          mode: "stopped",
          charsTyped: state.charsTyped,
          totalChars: state.totalChars,
          durationMs: state.durationMs,
        };
      }
      if (state.mode === "countdown") {
        return { mode: "idle" };
      }
      // sending → wait for ipcSendStopped
      return state;

    case "countdownTick":
      if (state.mode === "countdown" && state.remaining > 0) {
        return { ...state, remaining: state.remaining - 1 };
      }
      return state;

    case "countdownFire":
      // remaining=0 → start sending. The page kicks off the IPC in parallel.
      if (state.mode === "countdown") {
        return {
          mode: "sending",
          charsTyped: state.resumeOffset,
          totalChars: 0, // will be set by the page (it knows the text)
          startedAtMs: event.nowMs,
        };
      }
      return state;

    case "countdownCancelled":
      if (state.mode === "countdown") {
        return { mode: "idle" };
      }
      return state;

    case "ipcSendComplete":
      if (state.mode === "sending") {
        return {
          mode: "done",
          chars: event.chars,
          skipped: event.skipped,
          durationMs: event.durationMs,
        };
      }
      return state;

    case "ipcSendPaused":
      if (state.mode === "sending") {
        return {
          mode: "paused",
          position: event.position,
          charsTyped: event.charsTyped,
          totalChars: state.totalChars,
          durationMs: event.durationMs,
        };
      }
      return state;

    case "ipcSendStopped":
      if (state.mode === "sending" || state.mode === "paused") {
        const totalChars = state.mode === "sending" ? state.totalChars : state.totalChars;
        return {
          mode: "stopped",
          charsTyped: event.charsTyped,
          totalChars,
          durationMs: event.durationMs,
        };
      }
      return state;

    case "doneTimeout":
      if (state.mode === "done") {
        return { mode: "idle" };
      }
      return state;

    case "openSettings":
      if (state.mode === "idle") {
        return { mode: "settings" };
      }
      return state;

    case "closeSettings":
      if (state.mode === "settings") {
        return { mode: "idle" };
      }
      return state;
  }
}

/** Convenience: is the user in a state where they shouldn't be editing text? */
export function isTextLocked(state: AppState): boolean {
  return (
    state.mode === "sending" ||
    state.mode === "paused" ||
    state.mode === "countdown" ||
    state.mode === "done"
  );
}

/** Convenience: is a send currently active (typing or paused)? */
export function isActive(state: AppState): boolean {
  return state.mode === "sending" || state.mode === "paused";
}
