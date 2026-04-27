// Integration: SendEvent dispatcher → chunk-state → text panel rendering.
// Plays scripted SendEvent sequences through the pure dispatcher, rendering
// <TextPanel> with the resulting state at each step and asserting the
// chunk wrappers carry the right CSS classes. Covers the spec's
// "pause-for-fail" + "Skip-then-continue" + stop flows.
//
// Mocking @/lib/ipc here (TextPanel imports it for log / pickTextFile /
// readTextFile) keeps the test boundary pure; we only render TextPanel.

import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextPanel } from "@/components/text-panel";
import {
  type DispatchState,
  dispatchSendEvent,
  initialDispatchState,
} from "@/lib/core/send-dispatcher";
import type { DiffLine, DiffStats, SendEvent } from "@/lib/ipc";

vi.mock("@/lib/ipc", () => ({
  log: vi.fn(),
  logErr: vi.fn(),
  logWarning: vi.fn(),
  pickTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

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
  chunkStart: (index: number, total: number): SendEvent => ({
    event: "chunkStart",
    data: { index, total, lines: [] },
  }),
  chunkPass: (index: number): SendEvent => ({ event: "chunkPass", data: { index } }),
  chunkFail: (index: number): SendEvent => ({
    event: "chunkFail",
    data: { index, stats: STATS, diff: DIFF },
  }),
  sendComplete: (total: number, passed: number, failed: number): SendEvent => ({
    event: "sendComplete",
    data: { total, passed, failed, skipped: 0 },
  }),
  sendCancelled: (atChunk: number): SendEvent => ({
    event: "sendCancelled",
    data: { atChunk },
  }),
};

const CHUNKS_3 = [["a"], ["b"], ["c"]];

function renderPanelWithState(state: DispatchState, chunks = CHUNKS_3) {
  return render(
    <TextPanel
      text={chunks.flat().join("\n")}
      locked={true}
      onTextChange={vi.fn()}
      onLock={vi.fn()}
      onUnlock={vi.fn()}
      textareaRef={createRef<HTMLTextAreaElement>()}
      offendingLines={new Set<number>()}
      chunks={chunks}
      chunkStates={state.chunkStates}
      expandedFailChunks={state.expandedFailChunks}
      onChunkClick={vi.fn()}
      chunkFailDiffs={state.chunkFailDiffs}
      awaitingAck={state.awaitingAck}
      onAck={vi.fn()}
    />,
  );
}

function play(initial: DispatchState, events: SendEvent[]): DispatchState {
  let s = initial;
  for (const event of events) {
    s = dispatchSendEvent(s, event);
  }
  return s;
}

describe("chunk state machine integration", () => {
  it("happy path: 3 chunks all pass → final render shows three emerald-bordered chunks", () => {
    const final = play(initialDispatchState(3), [
      ev.chunkStart(0, 3),
      ev.chunkPass(0),
      ev.chunkStart(1, 3),
      ev.chunkPass(1),
      ev.chunkStart(2, 3),
      ev.chunkPass(2),
      ev.sendComplete(3, 3, 0),
    ]);
    const { container } = renderPanelWithState(final);
    expect(container.querySelector("#chunk-0")?.className).toContain("border-emerald-500");
    expect(container.querySelector("#chunk-1")?.className).toContain("border-emerald-500");
    expect(container.querySelector("#chunk-2")?.className).toContain("border-emerald-500");
    expect(final.sendSummary).toEqual({ total: 3, passed: 3, failed: 0, skipped: 0 });
  });

  it("pause-for-fail-then-skip: fail on chunk 0, then chunk 1 starts and passes", () => {
    let s = initialDispatchState(2);
    s = dispatchSendEvent(s, ev.chunkStart(0, 2));
    s = dispatchSendEvent(s, ev.chunkFail(0));
    // Pause-for-fail invariants:
    expect(s.awaitingAck).toBe(0);
    expect(s.expandedFailChunks.has(0)).toBe(true);
    // Render at the pause-point shows fail chunk auto-expanded.
    {
      const { container, unmount } = renderPanelWithState(s, [["a"], ["b"]]);
      expect(container.querySelector("#chunk-0")?.className).toContain("border-red-500");
      unmount();
    }
    // User clicks Skip → backend emits chunkStart for chunk 1 (acks the fail).
    s = dispatchSendEvent(s, ev.chunkStart(1, 2));
    s = dispatchSendEvent(s, ev.chunkPass(1));
    s = dispatchSendEvent(s, ev.sendComplete(2, 1, 1));
    expect(s.awaitingAck).toBeNull();
    const { container } = renderPanelWithState(s, [["a"], ["b"]]);
    expect(container.querySelector("#chunk-0")?.className).toContain("border-red-500");
    expect(container.querySelector("#chunk-1")?.className).toContain("border-emerald-500");
  });

  it("stop on first chunk: sendCancelled marks chunk yellow + remaining gray", () => {
    let s = initialDispatchState(3);
    s = dispatchSendEvent(s, ev.chunkStart(0, 3));
    s = dispatchSendEvent(s, ev.sendCancelled(0));
    expect(s.sendCancelledAt).toBe(0);
    const { container } = renderPanelWithState(s);
    expect(container.querySelector("#chunk-0")?.className).toContain("border-yellow-500");
    expect(container.querySelector("#chunk-1")?.className).toContain("border-zinc-300");
    expect(container.querySelector("#chunk-2")?.className).toContain("border-zinc-300");
  });
});
