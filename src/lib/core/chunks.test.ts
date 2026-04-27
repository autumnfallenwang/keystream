import { describe, expect, it } from "vitest";
import {
  applySendCancelled,
  CHUNK_SIZE_LINES,
  type ChunkState,
  chunkText,
  lineToChunkIndex,
} from "./chunks";

describe("chunkText", () => {
  it("empty input returns empty", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("12 lines split into [5,5,2]", () => {
    const text = Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n");
    const chunks = chunkText(text);
    expect(chunks).toEqual([
      ["line1", "line2", "line3", "line4", "line5"],
      ["line6", "line7", "line8", "line9", "line10"],
      ["line11", "line12"],
    ]);
  });

  it("exactly 5 lines = one chunk of 5, no trailing partial", () => {
    const text = "a\nb\nc\nd\ne";
    const chunks = chunkText(text);
    expect(chunks).toEqual([["a", "b", "c", "d", "e"]]);
  });

  it("drops trailing newline like Rust .lines()", () => {
    const chunks = chunkText("a\nb\n");
    expect(chunks).toEqual([["a", "b"]]);
  });

  it("preserves blank lines that aren't the trailing one", () => {
    const chunks = chunkText("a\n\nb");
    expect(chunks).toEqual([["a", "", "b"]]);
  });

  it("CHUNK_SIZE_LINES default matches the Rust constant (5)", () => {
    expect(CHUNK_SIZE_LINES).toBe(5);
  });
});

describe("lineToChunkIndex", () => {
  it("maps lines 1..5 to chunk 0", () => {
    expect(lineToChunkIndex(1)).toBe(0);
    expect(lineToChunkIndex(5)).toBe(0);
  });

  it("maps lines 6..10 to chunk 1, 11..15 to chunk 2", () => {
    expect(lineToChunkIndex(6)).toBe(1);
    expect(lineToChunkIndex(10)).toBe(1);
    expect(lineToChunkIndex(11)).toBe(2);
    expect(lineToChunkIndex(15)).toBe(2);
  });

  it("respects custom chunk size", () => {
    expect(lineToChunkIndex(7, 3)).toBe(2); // (7-1)/3 = 2
  });
});

describe("chunkText custom chunk size", () => {
  it("respects a non-default chunk size end-to-end", () => {
    // Locked decision says 5 today, but the helper accepts a parameter.
    // Pin the parameter wiring so a future v2 settings UI doesn't quietly
    // ignore the override.
    const text = "a\nb\nc\nd\ne\nf\ng";
    expect(chunkText(text, 3)).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
  });
});

describe("applySendCancelled", () => {
  it("marks the in-flight chunk as stopped when atChunk points at it", () => {
    const states: ChunkState[] = ["pass", "inProgress", "untouched", "untouched"];
    const { next, stoppedIdx } = applySendCancelled(states, 1);
    expect(stoppedIdx).toBe(1);
    expect(next).toEqual(["pass", "stopped", "untouched", "untouched"]);
  });

  it("falls back to the latest in-flight when atChunk is untouched", () => {
    // Cancel fired between chunks → backend's atChunk points to a chunk
    // never started. Walk back to the prior in-flight slot.
    const states: ChunkState[] = ["pass", "inProgress", "untouched", "untouched"];
    const { next, stoppedIdx } = applySendCancelled(states, 2);
    expect(stoppedIdx).toBe(1);
    expect(next).toEqual(["pass", "stopped", "untouched", "untouched"]);
  });

  it("treats a fail-awaiting-ack chunk as the stop target", () => {
    const states: ChunkState[] = ["pass", "fail", "untouched"];
    const { next, stoppedIdx } = applySendCancelled(states, 1);
    expect(stoppedIdx).toBe(1);
    expect(next).toEqual(["pass", "stopped", "untouched"]);
  });

  it("reverts any lingering inProgress at indices past the stopped one", () => {
    // Pathological: backend somehow had two inProgress chunks. Defensive
    // reset still kicks in.
    const states: ChunkState[] = ["inProgress", "inProgress"];
    const { next, stoppedIdx } = applySendCancelled(states, 0);
    expect(stoppedIdx).toBe(0);
    expect(next).toEqual(["stopped", "untouched"]);
  });

  it("handles atChunk past the end (cancel fired after the last chunk)", () => {
    // Backend's "between chunks" cancel branch can hand us an atChunk that
    // equals states.length — no chunk at that index. Helper must fall back
    // to the latest in-flight slot rather than OOB-write.
    const states: ChunkState[] = ["pass", "inProgress", "untouched"];
    const { next, stoppedIdx } = applySendCancelled(states, 3);
    expect(stoppedIdx).toBe(1);
    expect(next).toEqual(["pass", "stopped", "untouched"]);
  });
});
