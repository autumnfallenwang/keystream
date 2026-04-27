import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GateStates } from "@/lib/core/gates";
import { StatusStrip } from "./status-strip";

const ALL_FAIL: GateStates = {
  text: false,
  lines: false,
  region: false,
  permissions: false,
};

const ALL_PASS: GateStates = {
  text: true,
  lines: true,
  region: true,
  permissions: true,
};

function renderStrip(overrides: Partial<Parameters<typeof StatusStrip>[0]> = {}): {
  onRemediate: ReturnType<typeof vi.fn>;
  onClearClick: ReturnType<typeof vi.fn>;
} {
  const onRemediate = vi.fn();
  const onClearClick = vi.fn();
  render(
    <StatusStrip
      gates={ALL_FAIL}
      onRemediate={onRemediate}
      regionDetail={{ calibrating: false, error: null, region: null }}
      linesDetail={{ result: null, expanded: false, onToggleExpanded: vi.fn() }}
      permissionsDetail={{ permissions: null, expanded: false, onToggleExpanded: vi.fn() }}
      clearDisabled={true}
      onClearClick={onClearClick}
      {...overrides}
    />,
  );
  return { onRemediate, onClearClick };
}

describe("StatusStrip", () => {
  it("renders all four gate labels", () => {
    renderStrip();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Lines")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  it("renders ✓ generic gates as a non-interactive span (text gate when passing)", () => {
    renderStrip({ gates: { ...ALL_FAIL, text: true } });
    // The "Text" label should appear inside a non-button element when passing.
    const textLabel = screen.getByText("Text");
    expect(textLabel.closest("button")).toBeNull();
  });

  it("renders ✗ generic gates as a clickable button that fires onRemediate", async () => {
    const user = userEvent.setup();
    const { onRemediate } = renderStrip(); // ALL_FAIL → text is ✗
    const textLabel = screen.getByText("Text");
    const button = textLabel.closest("button");
    expect(button).not.toBeNull();
    await user.click(button as HTMLElement);
    expect(onRemediate).toHaveBeenCalledWith("text");
  });

  it("shows the region badge (e.g., 1707×922) when gates.region passes and a region is provided", () => {
    renderStrip({
      gates: { ...ALL_PASS },
      regionDetail: {
        calibrating: false,
        error: null,
        region: { x: 1, y: 2, w: 1707, h: 922 },
      },
    });
    expect(screen.getByText("1707×922")).toBeInTheDocument();
  });

  it("shows the lines count + chevron when offending lines are present", () => {
    renderStrip({
      linesDetail: {
        result: {
          ok: false,
          offending: [
            { line: 12, length: 137 },
            { line: 24, length: 99 },
          ],
        },
        expanded: false,
        onToggleExpanded: vi.fn(),
      },
    });
    expect(screen.getByText(/Lines · 2 too long/)).toBeInTheDocument();
    // ▸ also appears on the Permissions indicator; assert it's present at
    // least once and confirm the lines button contains one.
    const linesButton = screen.getByText(/Lines · 2 too long/).closest("button");
    expect(linesButton?.textContent).toContain("▸");
  });
});
