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
      <TextPanel text="" locked={false} state={idle} onTextChange={vi.fn()} wrap={false} onLoadFile={vi.fn()} />,
    );
    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument();
  });

  it("does not render a gutter in the empty state", () => {
    render(
      <TextPanel text="" locked={false} state={idle} onTextChange={vi.fn()} wrap={false} onLoadFile={vi.fn()} />,
    );
    // No line numbers when there's no text.
    expect(screen.queryByText("1")).toBeNull();
  });

  it("Load file button invokes onLoadFile", async () => {
    const onLoadFile = vi.fn();
    render(
      <TextPanel
        text=""
        locked={false}
        state={idle}
        wrap={false}
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
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const ta = screen.getByDisplayValue("hello") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
  });

  it("D-03: renders the gutter with line numbers in edit mode", () => {
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={false}
        state={idle}
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("D-03: edit-mode gutter has no active-line marker (no '→' caret)", () => {
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={false}
        state={idle}
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    // The locked-mode '→ ' caret should never appear in edit mode, even
    // if the app state happens to be in a sending-like shape.
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("Q16: edit-mode textarea disables soft-wrap (whiteSpace: pre)", () => {
    render(
      <TextPanel
        text={"a very long line that would otherwise wrap"}
        locked={false}
        state={idle}
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const ta = screen.getByDisplayValue(/a very long line/) as HTMLTextAreaElement;
    expect(ta.style.whiteSpace).toBe("pre");
    expect(ta.getAttribute("wrap")).toBe("off");
  });
});

describe("TextPanel — locked mode", () => {
  it("renders line numbers in the gutter", () => {
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={true}
        state={idle}
        wrap={false}
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
        wrap={false}
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
        wrap={false}
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
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("active-line")).toBeNull();
  });

  it("B-03 / Q16: gutter rows have explicit line-height matching content", () => {
    // The gutter and content `<pre>` MUST share the same line-height so
    // the columns align row-for-row. Both are anchored to 20.8px
    // (= 13 × 1.6) regardless of the gutter's smaller font-size.
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={true}
        state={idle}
        wrap={false}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const lineOne = screen.getByText("1");
    expect(lineOne.style.lineHeight).toBe("20.8px");
    expect(lineOne.style.height).toBe("20.8px");
  });
});
