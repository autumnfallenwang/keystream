import { describe, expect, it } from "vitest";
import { charDiffSpans } from "./diff-render";

describe("charDiffSpans", () => {
  it("equal strings produce a single 'same' span per side", () => {
    const { sent, seen } = charDiffSpans("hello", "hello");
    expect(sent).toEqual([{ kind: "same", text: "hello" }]);
    expect(seen).toEqual([{ kind: "same", text: "hello" }]);
  });

  it("isolates a single-char diff in the middle", () => {
    const { sent, seen } = charDiffSpans("hello", "h3llo");
    expect(sent).toEqual([
      { kind: "same", text: "h" },
      { kind: "diff", text: "e" },
      { kind: "same", text: "llo" },
    ]);
    expect(seen).toEqual([
      { kind: "same", text: "h" },
      { kind: "diff", text: "3" },
      { kind: "same", text: "llo" },
    ]);
  });

  it("collapses consecutive diff chars into one span", () => {
    const { sent, seen } = charDiffSpans("abcde", "ax9de");
    expect(sent).toEqual([
      { kind: "same", text: "a" },
      { kind: "diff", text: "bc" },
      { kind: "same", text: "de" },
    ]);
    expect(seen).toEqual([
      { kind: "same", text: "a" },
      { kind: "diff", text: "x9" },
      { kind: "same", text: "de" },
    ]);
  });

  it("flags trailing chars on longer sent as extra", () => {
    const { sent, seen } = charDiffSpans("hello!", "hello");
    expect(sent).toEqual([
      { kind: "same", text: "hello" },
      { kind: "extra", text: "!" },
    ]);
    expect(seen).toEqual([{ kind: "same", text: "hello" }]);
  });

  it("flags trailing chars on longer seen as extra", () => {
    const { sent, seen } = charDiffSpans("hello", "hellow");
    expect(sent).toEqual([{ kind: "same", text: "hello" }]);
    expect(seen).toEqual([
      { kind: "same", text: "hello" },
      { kind: "extra", text: "w" },
    ]);
  });

  it("handles two empty strings", () => {
    const { sent, seen } = charDiffSpans("", "");
    expect(sent).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("handles one empty string (everything is extra on the other side)", () => {
    const a = charDiffSpans("", "abc");
    expect(a.sent).toEqual([]);
    expect(a.seen).toEqual([{ kind: "extra", text: "abc" }]);
    const b = charDiffSpans("abc", "");
    expect(b.sent).toEqual([{ kind: "extra", text: "abc" }]);
    expect(b.seen).toEqual([]);
  });

  it("handles mixed diff + trailing extra (longer seen with diff in middle)", () => {
    // Positions 0..2: a==a, b!=x, c!=y → a same, "bc" diff. Position 3: extra "z" on seen.
    const { sent, seen } = charDiffSpans("abc", "axyz");
    expect(sent).toEqual([
      { kind: "same", text: "a" },
      { kind: "diff", text: "bc" },
    ]);
    expect(seen).toEqual([
      { kind: "same", text: "a" },
      { kind: "diff", text: "xy" },
      { kind: "extra", text: "z" },
    ]);
  });

  it("preserves unicode code points (emoji + accented chars iterated by Array.from)", () => {
    // 'é' (1 code point) ≠ 'e'. Following space + emoji must remain intact —
    // the rocket emoji is U+1F680 (a 4-byte / surrogate-pair string), so a
    // naive char-by-char iteration would split it into two halves.
    const { sent, seen } = charDiffSpans("café 🚀", "cafe 🚀");
    expect(sent).toEqual([
      { kind: "same", text: "caf" },
      { kind: "diff", text: "é" },
      { kind: "same", text: " 🚀" },
    ]);
    expect(seen).toEqual([
      { kind: "same", text: "caf" },
      { kind: "diff", text: "e" },
      { kind: "same", text: " 🚀" },
    ]);
  });
});
