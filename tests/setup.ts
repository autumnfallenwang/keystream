import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// happy-dom does not implement ResizeObserver. CodeMirror calls it during
// measurement, so we polyfill a no-op so the editor mounts cleanly in
// tests. Geometry-dependent behavior is owned by CodeMirror in real
// browsers and out of scope for our unit tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  class StubResizeObserver {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op stub
    observe(): void {}
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op stub
    unobserve(): void {}
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op stub
    disconnect(): void {}
  }
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
