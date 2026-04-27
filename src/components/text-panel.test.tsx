import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChunkState } from "@/lib/core/chunks";
import type { ContinueAction, DiffLine, DiffStats } from "@/lib/ipc";

// Mock @/lib/ipc at the module boundary so the component never reaches
// @tauri-apps/api/core. RTL never needs the real implementation.
vi.mock("@/lib/ipc", () => ({
  log: vi.fn(),
  logErr: vi.fn(),
  logWarning: vi.fn(),
  pickTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

import { TextPanel } from "./text-panel";

function renderPanel(overrides: Partial<Parameters<typeof TextPanel>[0]> = {}): {
  onTextChange: ReturnType<typeof vi.fn>;
  onLock: ReturnType<typeof vi.fn>;
  onUnlock: ReturnType<typeof vi.fn>;
  onChunkClick: ReturnType<typeof vi.fn>;
  onAck: ReturnType<typeof vi.fn<(action: ContinueAction) => void>>;
} {
  const ref = createRef<HTMLTextAreaElement>();
  const onTextChange = vi.fn();
  const onLock = vi.fn();
  const onUnlock = vi.fn();
  const onChunkClick = vi.fn();
  const onAck = vi.fn();
  render(
    <TextPanel
      text=""
      locked={false}
      onTextChange={onTextChange}
      onLock={onLock}
      onUnlock={onUnlock}
      textareaRef={ref}
      offendingLines={new Set<number>()}
      chunks={[]}
      chunkStates={[]}
      expandedFailChunks={new Set<number>()}
      onChunkClick={onChunkClick}
      chunkFailDiffs={new Map<number, { stats: DiffStats; diff: DiffLine[] }>()}
      awaitingAck={null}
      onAck={onAck}
      {...overrides}
    />,
  );
  return { onTextChange, onLock, onUnlock, onChunkClick, onAck };
}

describe("TextPanel", () => {
  it("editable mode shows the placeholder textarea", () => {
    renderPanel();
    expect(screen.getByPlaceholderText("Paste text or click Load File")).toBeInTheDocument();
  });

  it("Submit button is disabled when text is empty", () => {
    renderPanel();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
  });

  it("Submit button enables when text has content; clicking calls onLock", async () => {
    const user = userEvent.setup();
    const { onLock } = renderPanel({ text: "hello world" });
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("locked mode renders chunk wrappers with correct state classes", () => {
    const { container } = render(
      <TextPanel
        text="a\nb\nc"
        locked={true}
        onTextChange={vi.fn()}
        onLock={vi.fn()}
        onUnlock={vi.fn()}
        textareaRef={createRef<HTMLTextAreaElement>()}
        offendingLines={new Set<number>()}
        chunks={[["line1", "line2", "line3"], ["line4", "line5", "line6"], ["line7"]]}
        chunkStates={["pass", "inProgress", "fail"] as ChunkState[]}
        expandedFailChunks={new Set<number>()}
        onChunkClick={vi.fn()}
        chunkFailDiffs={new Map<number, { stats: DiffStats; diff: DiffLine[] }>()}
        awaitingAck={null}
        onAck={vi.fn()}
      />,
    );
    // Each chunk wrapper has an `id="chunk-N"` (added in task 39 for auto-scroll).
    const c0 = container.querySelector("#chunk-0");
    const c1 = container.querySelector("#chunk-1");
    const c2 = container.querySelector("#chunk-2");
    expect(c0?.className).toContain("border-emerald-500"); // pass
    expect(c1?.className).toContain("border-blue-500"); // inProgress
    expect(c2?.className).toContain("border-red-500"); // fail
  });

  it("offending lines render with a red-tinted background class", () => {
    const { container } = render(
      <TextPanel
        text="ok\nlong"
        locked={true}
        onTextChange={vi.fn()}
        onLock={vi.fn()}
        onUnlock={vi.fn()}
        textareaRef={createRef<HTMLTextAreaElement>()}
        offendingLines={new Set<number>([2])}
        chunks={[["ok", "long"]]}
        chunkStates={["untouched"]}
        expandedFailChunks={new Set<number>()}
        onChunkClick={vi.fn()}
        chunkFailDiffs={new Map<number, { stats: DiffStats; diff: DiffLine[] }>()}
        awaitingAck={null}
        onAck={vi.fn()}
      />,
    );
    // The offending line content cell should carry the bg-red-50 class.
    const offendingSpan = container.querySelector("span.bg-red-50");
    expect(offendingSpan).not.toBeNull();
    expect(offendingSpan?.textContent).toBe("long");
  });
});
