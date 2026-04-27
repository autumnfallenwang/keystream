import { describe, expect, it } from "vitest";
import type { DiffLine, DiffStats, SendEvent } from "@/lib/ipc";
import type { ChunkState } from "./chunks";
import { type DispatchState, dispatchSendEvent, initialDispatchState } from "./send-dispatcher";

const STATS: DiffStats = {
  alignedLines: 1,
  matchingLines: 0,
  charDiffs: 1,
  totalChars: 5,
  dropped: 0,
  extra: 0,
  sentChars: 5,
  seenChars: 5,
};

const DIFF: DiffLine[] = [
  { kind: "Mismatch", index: 0, sent: "hello", seen: "h3llo", charDiffs: 1 },
];

const ev = {
  chunkStart: (index: number, total: number, lines: string[] = []): SendEvent => ({
    event: "chunkStart",
    data: { index, total, lines },
  }),
  chunkPass: (index: number): SendEvent => ({ event: "chunkPass", data: { index } }),
  chunkFail: (index: number): SendEvent => ({
    event: "chunkFail",
    data: { index, stats: STATS, diff: DIFF },
  }),
  sendComplete: (total: number, passed: number, failed: number, skipped: number): SendEvent => ({
    event: "sendComplete",
    data: { total, passed, failed, skipped },
  }),
  sendCancelled: (atChunk: number): SendEvent => ({
    event: "sendCancelled",
    data: { atChunk },
  }),
};

describe("initialDispatchState", () => {
  it("returns 0 chunkStates for chunkCount=0", () => {
    const s = initialDispatchState(0);
    expect(s.chunkStates).toEqual([]);
    expect(s.awaitingAck).toBeNull();
    expect(s.chunkFailDiffs.size).toBe(0);
    expect(s.expandedFailChunks.size).toBe(0);
    expect(s.sendSummary).toBeNull();
    expect(s.sendCancelledAt).toBeNull();
    expect(s.sending).toBe(false);
  });

  it("produces 3 untouched chunks for chunkCount=3", () => {
    const s = initialDispatchState(3);
    expect(s.chunkStates).toEqual(["untouched", "untouched", "untouched"]);
  });
});

describe("dispatchSendEvent", () => {
  it("chunkStart sets the targeted index to inProgress and clears awaitingAck", () => {
    const initial: DispatchState = {
      ...initialDispatchState(3),
      awaitingAck: 1, // pretend we were awaiting an old ack
    };
    const next = dispatchSendEvent(initial, ev.chunkStart(1, 3));
    expect(next.chunkStates).toEqual(["untouched", "inProgress", "untouched"]);
    expect(next.awaitingAck).toBeNull();
    expect(next.sending).toBe(true);
  });

  it("chunkStart with mismatched total resizes the chunkStates array defensively", () => {
    const initial = initialDispatchState(2); // frontend thinks 2
    const next = dispatchSendEvent(initial, ev.chunkStart(2, 5)); // backend says 5
    expect(next.chunkStates.length).toBe(5);
    expect(next.chunkStates[2]).toBe("inProgress");
  });

  it("chunkPass sets the index to pass and clears awaitingAck", () => {
    const initial: DispatchState = {
      ...initialDispatchState(2),
      chunkStates: ["inProgress", "untouched"],
      awaitingAck: 0,
    };
    const next = dispatchSendEvent(initial, ev.chunkPass(0));
    expect(next.chunkStates).toEqual(["pass", "untouched"]);
    expect(next.awaitingAck).toBeNull();
  });

  it("chunkFail sets fail, stashes diff, sets awaitingAck, and auto-expands the chunk", () => {
    const initial = initialDispatchState(3);
    const next = dispatchSendEvent(initial, ev.chunkFail(1));
    expect(next.chunkStates[1]).toBe("fail");
    expect(next.awaitingAck).toBe(1);
    expect(next.chunkFailDiffs.get(1)).toEqual({ stats: STATS, diff: DIFF });
    expect(next.expandedFailChunks.has(1)).toBe(true);
  });

  it("sendComplete sets the summary and clears sending + awaitingAck", () => {
    const initial: DispatchState = {
      ...initialDispatchState(2),
      sending: true,
      awaitingAck: 1,
    };
    const next = dispatchSendEvent(initial, ev.sendComplete(2, 1, 1, 0));
    expect(next.sendSummary).toEqual({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(next.sending).toBe(false);
    expect(next.awaitingAck).toBeNull();
  });

  it("sendCancelled marks the in-flight chunk stopped and clears state", () => {
    const initial: DispatchState = {
      ...initialDispatchState(3),
      chunkStates: ["pass", "inProgress", "untouched"],
      sending: true,
      awaitingAck: 1,
    };
    const next = dispatchSendEvent(initial, ev.sendCancelled(1));
    expect(next.chunkStates).toEqual(["pass", "stopped", "untouched"]);
    expect(next.sendCancelledAt).toBe(1);
    expect(next.sending).toBe(false);
    expect(next.awaitingAck).toBeNull();
  });

  it("pause-for-fail flow: chunkStart → chunkFail leaves the user awaiting an ack", () => {
    let s = initialDispatchState(2);
    s = dispatchSendEvent(s, ev.chunkStart(0, 2));
    s = dispatchSendEvent(s, ev.chunkFail(0));
    expect(s.chunkStates[0]).toBe("fail");
    expect(s.awaitingAck).toBe(0);
    expect(s.expandedFailChunks.has(0)).toBe(true);
  });

  it("Skip-then-continue flow: chunkStart on next index clears awaitingAck without flipping prior fail", () => {
    let s = initialDispatchState(2);
    s = dispatchSendEvent(s, ev.chunkStart(0, 2));
    s = dispatchSendEvent(s, ev.chunkFail(0));
    // User clicks Skip → backend emits chunkStart for the next chunk.
    s = dispatchSendEvent(s, ev.chunkStart(1, 2));
    expect(s.chunkStates[0]).toBe("fail"); // prior fail preserved
    expect(s.chunkStates[1]).toBe("inProgress");
    expect(s.awaitingAck).toBeNull();
  });

  it("Retry-and-pass flow: chunkPass on the failed index flips it green and clears awaitingAck", () => {
    let s = initialDispatchState(1);
    s = dispatchSendEvent(s, ev.chunkStart(0, 1));
    s = dispatchSendEvent(s, ev.chunkFail(0));
    // User clicks Continue → backend re-runs verify → passes this time.
    s = dispatchSendEvent(s, ev.chunkPass(0));
    expect(s.chunkStates[0]).toBe("pass");
    expect(s.awaitingAck).toBeNull();
  });

  it("Cancel-during-fail flow: sendCancelled while awaiting ack clears the ack and marks stopped", () => {
    let s = initialDispatchState(3);
    s = dispatchSendEvent(s, ev.chunkStart(0, 3));
    s = dispatchSendEvent(s, ev.chunkFail(0));
    s = dispatchSendEvent(s, ev.sendCancelled(0));
    expect(s.chunkStates[0]).toBe("stopped");
    expect(s.sendCancelledAt).toBe(0);
    expect(s.awaitingAck).toBeNull();
    expect(s.sending).toBe(false);
  });

  it("dispatcher returns new arrays/maps/sets — never mutates input", () => {
    const initial: DispatchState = {
      ...initialDispatchState(2),
      chunkStates: ["inProgress", "untouched"] as ChunkState[],
    };
    const initialChunkStates = initial.chunkStates;
    const initialFailDiffs = initial.chunkFailDiffs;
    const initialExpanded = initial.expandedFailChunks;
    dispatchSendEvent(initial, ev.chunkFail(0));
    expect(initial.chunkStates).toBe(initialChunkStates);
    expect(initial.chunkStates[0]).toBe("inProgress"); // unchanged
    expect(initial.chunkFailDiffs).toBe(initialFailDiffs);
    expect(initial.chunkFailDiffs.size).toBe(0);
    expect(initial.expandedFailChunks).toBe(initialExpanded);
    expect(initial.expandedFailChunks.size).toBe(0);
  });
});
