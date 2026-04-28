import { describe, expect, it } from "vitest";
import type { AppState } from "./app-state";
import { computeStatusText } from "./progress";

describe("computeStatusText", () => {
  it("returns null for idle (gates strip is shown instead)", () => {
    expect(computeStatusText({ state: { mode: "idle" }, totalChars: 0 })).toBe(null);
  });

  it("returns null while in countdown", () => {
    const state: AppState = {
      mode: "countdown",
      remaining: 2,
      intent: "send",
      resumeOffset: 0,
    };
    expect(computeStatusText({ state, totalChars: 100 })).toBe(null);
  });

  it("returns null in settings", () => {
    expect(computeStatusText({ state: { mode: "settings" }, totalChars: 0 })).toBe(null);
  });

  it("formats sending with comma-separated digits", () => {
    const state: AppState = {
      mode: "sending",
      charsTyped: 4_521,
      totalChars: 15_017,
      startedAtMs: 0,
    };
    expect(computeStatusText({ state, totalChars: 15_017 })).toBe("Typing 4,521 / 15,017 chars");
  });

  it("formats paused with elapsed seconds", () => {
    const state: AppState = {
      mode: "paused",
      position: 4_521,
      charsTyped: 4_521,
      totalChars: 15_017,
      durationMs: 18_400,
    };
    expect(computeStatusText({ state, totalChars: 15_017 })).toBe(
      "⏸ Paused at 4,521 / 15,017 chars · 18.4s",
    );
  });

  it("formats done with chars and elapsed seconds", () => {
    const state: AppState = {
      mode: "done",
      chars: 15_017,
      skipped: 0,
      durationMs: 60_200,
    };
    expect(computeStatusText({ state, totalChars: 15_017 })).toBe("✓ Done · 15,017 chars · 60.2s");
  });

  it("formats stopped with the partial position", () => {
    const state: AppState = {
      mode: "stopped",
      charsTyped: 4_521,
      totalChars: 15_017,
      durationMs: 18_400,
    };
    expect(computeStatusText({ state, totalChars: 15_017 })).toBe(
      "⏹ Stopped at 4,521 / 15,017 chars",
    );
  });
});
