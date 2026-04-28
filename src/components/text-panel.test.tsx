import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/core/app-state";
import { TextPanel } from "./text-panel";

const idle: AppState = { mode: "idle" };

const sendingAt = (charsTyped: number, totalChars: number): AppState => ({
  mode: "sending",
  charsTyped,
  totalChars,
  startedAtMs: 0,
});

const pausedAt = (charsTyped: number): AppState => ({
  mode: "paused",
  position: charsTyped,
  charsTyped,
  totalChars: 100,
  durationMs: 1_000,
});

describe("TextPanel — edit mode", () => {
  it("shows the empty-state hint when text is empty", () => {
    render(
      <TextPanel text="" locked={false} state={idle} onTextChange={vi.fn()} onLoadFile={vi.fn()} />,
    );
    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument();
  });

  it("Load file button invokes onLoadFile", async () => {
    const onLoadFile = vi.fn();
    render(
      <TextPanel
        text=""
        locked={false}
        state={idle}
        onTextChange={vi.fn()}
        onLoadFile={onLoadFile}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /load file/i }));
    expect(onLoadFile).toHaveBeenCalledOnce();
  });

  it("renders an editable textarea when text is non-empty", () => {
    render(
      <TextPanel
        text="hello"
        locked={false}
        state={idle}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const ta = screen.getByDisplayValue("hello") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
  });
});

describe("TextPanel — locked mode", () => {
  it("renders line numbers in the gutter", () => {
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={true}
        state={idle}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("draws an active-line indicator while sending", () => {
    // text is "abc\ndef" — 7 chars total. Sending with charsTyped=4 means
    // the next char is on line 2 (index 1).
    const text = "abc\ndef";
    render(
      <TextPanel
        text={text}
        locked={true}
        state={sendingAt(4, text.length)}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("active-line")).toBeInTheDocument();
    const scanline = screen.getByTestId("scanline");
    expect(scanline.dataset.paused).toBe("false");
  });

  it("freezes the scanline when paused", () => {
    const text = "abc\ndef";
    render(
      <TextPanel
        text={text}
        locked={true}
        state={pausedAt(4)}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const scanline = screen.getByTestId("scanline");
    expect(scanline.dataset.paused).toBe("true");
  });

  it("renders no active-line indicator in idle mode", () => {
    render(
      <TextPanel
        text="abc"
        locked={true}
        state={idle}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("active-line")).toBeNull();
  });
});
