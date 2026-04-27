import { describe, expect, it } from "vitest";
import type { ChunkState } from "./chunks";
import { computeProgressText } from "./progress";

const FALLBACK = "Waiting on 1 gate(s)";

describe("computeProgressText", () => {
  it("idle (no sending, no summary) returns the fallback", () => {
    const text = computeProgressText({
      chunkStates: [],
      sending: false,
      sendSummary: null,
      sendCancelledAt: null,
      fallback: FALLBACK,
    });
    expect(text).toBe(FALLBACK);
  });

  it("sending with one in-progress chunk reports 'Chunk N / total · X% done'", () => {
    const chunkStates: ChunkState[] = ["pass", "inProgress", "untouched", "untouched"];
    const text = computeProgressText({
      chunkStates,
      sending: true,
      sendSummary: null,
      sendCancelledAt: null,
      fallback: FALLBACK,
    });
    expect(text).toBe("Chunk 2 / 4 · 25% done");
  });

  it("sending mid-state (no in-progress, just completed counts) reports 'C / total · X% done'", () => {
    const chunkStates: ChunkState[] = ["pass", "pass", "untouched"];
    const text = computeProgressText({
      chunkStates,
      sending: true,
      sendSummary: null,
      sendCancelledAt: null,
      fallback: FALLBACK,
    });
    expect(text).toBe("2 / 3 · 67% done");
  });

  it("done reports 'Done · P/T passed'", () => {
    const text = computeProgressText({
      chunkStates: ["pass", "pass", "fail"],
      sending: false,
      sendSummary: { total: 3, passed: 2, failed: 1, skipped: 0 },
      sendCancelledAt: null,
      fallback: FALLBACK,
    });
    expect(text).toBe("Done · 2/3 passed");
  });

  it("done with all skipped via cancellation still reports the summary", () => {
    const text = computeProgressText({
      chunkStates: ["pass", "untouched", "untouched"],
      sending: false,
      sendSummary: { total: 3, passed: 1, failed: 0, skipped: 2 },
      sendCancelledAt: null,
      fallback: FALLBACK,
    });
    expect(text).toBe("Done · 1/3 passed");
  });

  it("sendCancelledAt set returns 'Stopped at chunk N / total' (1-indexed)", () => {
    const chunkStates: ChunkState[] = ["pass", "pass", "stopped", "untouched"];
    const text = computeProgressText({
      chunkStates,
      sending: false,
      sendSummary: null,
      sendCancelledAt: 2,
      fallback: FALLBACK,
    });
    expect(text).toBe("Stopped at chunk 3 / 4");
  });

  it("sendCancelledAt takes precedence over fallback even when sending=false", () => {
    const text = computeProgressText({
      chunkStates: ["stopped"],
      sending: false,
      sendSummary: null,
      sendCancelledAt: 0,
      fallback: FALLBACK,
    });
    expect(text).toBe("Stopped at chunk 1 / 1");
  });

  it("sendCancelledAt takes precedence over sendSummary if both are somehow set", () => {
    // Backend never emits both per session (it's either SendComplete OR
    // SendCancelled). Defensive ordering pin: a future refactor that
    // swaps the branch order would fail this test.
    const text = computeProgressText({
      chunkStates: ["pass", "stopped", "untouched"],
      sending: false,
      sendSummary: { total: 3, passed: 1, failed: 0, skipped: 0 },
      sendCancelledAt: 1,
      fallback: FALLBACK,
    });
    expect(text).toBe("Stopped at chunk 2 / 3");
  });
});
