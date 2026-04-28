import { describe, expect, it } from "vitest";
import { activeLineIndex } from "./active-line";

describe("activeLineIndex", () => {
  it("returns 0 for empty text", () => {
    expect(activeLineIndex("", 0)).toBe(0);
  });

  it("returns 0 when charsTyped is 0", () => {
    expect(activeLineIndex("hello\nworld", 0)).toBe(0);
  });

  it("returns 0 mid-first-line", () => {
    expect(activeLineIndex("hello\nworld", 3)).toBe(0);
  });

  it("returns 1 after the first newline (next char to type is on line 1)", () => {
    // "hello\n" — 6 chars typed, next char is the 'w' on line 1.
    expect(activeLineIndex("hello\nworld", 6)).toBe(1);
  });

  it("clamps to last line when charsTyped exceeds text length", () => {
    expect(activeLineIndex("hello\nworld", 999)).toBe(1);
  });

  it("counts multiple newlines correctly", () => {
    // "a\nb\nc\nd" — after "a\nb\nc\n" (6 chars), we're on line 3.
    expect(activeLineIndex("a\nb\nc\nd", 6)).toBe(3);
  });
});
