import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DiffLine, DiffStats } from "@/lib/ipc";
import { FailDiff } from "./fail-diff";

const STATS: DiffStats = {
  alignedLines: 5,
  matchingLines: 3,
  charDiffs: 4,
  totalChars: 100,
  dropped: 1,
  extra: 1,
  sentChars: 100,
  seenChars: 99,
};

const MISMATCH_LINE: DiffLine = {
  kind: "Mismatch",
  index: 1,
  sent: "hello",
  seen: "h3llo",
  charDiffs: 1,
};

const DROP_LINE: DiffLine = {
  kind: "OcrDrop",
  index: 2,
  sent: "let x = 1;",
  seen: null,
  charDiffs: 0,
};

const EXTRA_LINE: DiffLine = {
  kind: "OcrExtra",
  index: 3,
  sent: null,
  seen: "stray text",
  charDiffs: 0,
};

const MATCH_LINE: DiffLine = {
  kind: "Match",
  index: 0,
  sent: "ok",
  seen: "ok",
  charDiffs: 0,
};

describe("FailDiff", () => {
  it("stats line shows aligned/matching/drops/extras/char_diffs counts", () => {
    render(<FailDiff diff={[MISMATCH_LINE]} stats={STATS} awaitingAck={false} onAck={vi.fn()} />);
    expect(screen.getByText(/aligned=5/)).toBeInTheDocument();
    expect(screen.getByText(/matching=3/)).toBeInTheDocument();
    expect(screen.getByText(/drops=1/)).toBeInTheDocument();
    expect(screen.getByText(/extras=1/)).toBeInTheDocument();
    expect(screen.getByText(/char_diffs=4/)).toBeInTheDocument();
  });

  it("renders a mismatch row with sent + seen labels and char-diff highlighting", () => {
    const { container } = render(
      <FailDiff
        diff={[MATCH_LINE, MISMATCH_LINE]}
        stats={STATS}
        awaitingAck={false}
        onAck={vi.fn()}
      />,
    );
    // "Match" rows are filtered out — only the mismatch should render.
    expect(screen.getByText("sent")).toBeInTheDocument();
    expect(screen.getByText("seen")).toBeInTheDocument();
    // Char-diff highlighting: at least one span with the diff red-bg class.
    const diffSpans = container.querySelectorAll("span.bg-red-200");
    expect(diffSpans.length).toBeGreaterThan(0);
  });

  it("renders OcrDrop and OcrExtra rows with their respective labels", () => {
    render(
      <FailDiff diff={[DROP_LINE, EXTRA_LINE]} stats={STATS} awaitingAck={false} onAck={vi.fn()} />,
    );
    expect(screen.getByText("OCR drop")).toBeInTheDocument();
    expect(screen.getByText("OCR extra")).toBeInTheDocument();
  });

  it("renders no buttons when awaitingAck=false", () => {
    render(<FailDiff diff={[MISMATCH_LINE]} stats={STATS} awaitingAck={false} onAck={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("renders three buttons that fire onAck with the correct action when awaitingAck=true", async () => {
    const user = userEvent.setup();
    const onAck = vi.fn();
    render(<FailDiff diff={[MISMATCH_LINE]} stats={STATS} awaitingAck={true} onAck={onAck} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAck).toHaveBeenLastCalledWith("skip");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(onAck).toHaveBeenLastCalledWith("stop");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAck).toHaveBeenLastCalledWith("retry");
    expect(onAck).toHaveBeenCalledTimes(3);
  });
});
