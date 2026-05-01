import { act, render, screen } from "@testing-library/react";
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

// Q22 — the editor's active-line decoration is dispatched in a useEffect
// that runs after mount. Tests that assert on it need to flush that
// effect first.
async function flushEffects() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("TextPanel — empty state", () => {
  it("shows the empty-state hint when text is empty", () => {
    render(
      <TextPanel
        text=""
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByText(/drop a file here/i)).toBeInTheDocument();
  });

  it("does not mount the CodeMirror host in the empty state", () => {
    render(
      <TextPanel
        text=""
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("cm-host")).toBeNull();
  });

  it("Load file button invokes onLoadFile", async () => {
    const onLoadFile = vi.fn();
    render(
      <TextPanel
        text=""
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={onLoadFile}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /load file/i }));
    expect(onLoadFile).toHaveBeenCalledOnce();
  });
});

describe("TextPanel — editor mount", () => {
  it("mounts the CodeMirror host when text is non-empty", () => {
    render(
      <TextPanel
        text="hello"
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cm-host")).toBeInTheDocument();
  });

  it("renders the document text inside the editor", () => {
    render(
      <TextPanel
        text={"alpha\nbeta\ngamma"}
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    const host = screen.getByTestId("cm-host");
    // CodeMirror renders the doc's content inside .cm-content. Check
    // that each source line shows up — confirms the editor mounted with
    // our `doc` and rendered through.
    const content = host.querySelector(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("alpha");
    expect(content?.textContent).toContain("beta");
    expect(content?.textContent).toContain("gamma");
  });

  it("mounts cleanly with a known filename (language detection)", () => {
    render(
      <TextPanel
        text={"const x = 1;"}
        locked={false}
        state={idle}
        wrap={false}
        filename="app.ts"
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cm-host")).toBeInTheDocument();
  });
});

describe("TextPanel — lock toggle (Q14, Q16)", () => {
  it("locked=true makes the editor non-editable", async () => {
    render(
      <TextPanel
        text="abc"
        locked={true}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const content = document.querySelector(".cm-content");
    expect(content?.getAttribute("contenteditable")).toBe("false");
  });

  it("locked=false makes the editor editable", async () => {
    render(
      <TextPanel
        text="abc"
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const content = document.querySelector(".cm-content");
    expect(content?.getAttribute("contenteditable")).toBe("true");
  });
});

describe("TextPanel — wrap toggle (Q21)", () => {
  it("wrap=true sets the lineWrapping class on the content", async () => {
    render(
      <TextPanel
        text="abc"
        locked={false}
        state={idle}
        wrap={true}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const content = document.querySelector(".cm-content");
    expect(content?.classList.contains("cm-lineWrapping")).toBe(true);
  });

  it("wrap=false omits the lineWrapping class", async () => {
    render(
      <TextPanel
        text="abc"
        locked={false}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const content = document.querySelector(".cm-content");
    expect(content?.classList.contains("cm-lineWrapping")).toBe(false);
  });
});

describe("TextPanel — active-line indicator (Q14)", () => {
  it("draws an active-line decoration while sending", async () => {
    // text "abc\ndef" — 7 chars; with charsTyped=4, the next char is on
    // line index 1 (the "def" line).
    render(
      <TextPanel
        text={"abc\ndef"}
        locked={true}
        state={sendingAt(4, 7)}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const active = screen.getByTestId("active-line");
    expect(active).toBeInTheDocument();
    expect(active.dataset.paused).toBe("false");
  });

  it("freezes the scanline (data-paused=true) when paused", async () => {
    render(
      <TextPanel
        text={"abc\ndef"}
        locked={true}
        state={pausedAt(4)}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    const active = screen.getByTestId("active-line");
    expect(active.dataset.paused).toBe("true");
  });

  it("renders no active-line decoration in idle mode", async () => {
    render(
      <TextPanel
        text={"abc\ndef"}
        locked={true}
        state={idle}
        wrap={false}
        filename={null}
        onTextChange={vi.fn()}
        onLoadFile={vi.fn()}
      />,
    );
    await flushEffects();
    expect(screen.queryByTestId("active-line")).toBeNull();
  });
});
