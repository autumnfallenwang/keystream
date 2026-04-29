import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/ipc";
import { AdvancedSection, type AdvancedSectionProps } from "./advanced-section";

const defaultSettings: Settings = {
  eventPauseMs: 10,
  modHoldMs: 10,
  warmupShift: true,
  countdownSecs: 3,
  appearance: { profile: "atelier", mode: "system", fontSize: 1.0 },
  sidebarWidthPx: 260,
};

function defaults(overrides: Partial<AdvancedSectionProps> = {}): AdvancedSectionProps {
  return {
    settings: defaultSettings,
    onChange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

describe("AdvancedSection — rendering", () => {
  it("renders the Shift warmup checkbox checked when settings.warmupShift=true", () => {
    render(<AdvancedSection {...defaults()} />);
    expect(screen.getByRole("checkbox", { name: /shift warmup/i })).toBeChecked();
  });

  it("renders the Shift warmup checkbox unchecked when warmupShift=false", () => {
    render(
      <AdvancedSection {...defaults({ settings: { ...defaultSettings, warmupShift: false } })} />,
    );
    expect(screen.getByRole("checkbox", { name: /shift warmup/i })).not.toBeChecked();
  });

  it("renders the Reset to defaults button", () => {
    render(<AdvancedSection {...defaults()} />);
    expect(screen.getByRole("button", { name: /reset to defaults/i })).toBeInTheDocument();
  });

  it("Q17: Reset section's info-icon helper explains that it clears every tab", () => {
    render(<AdvancedSection {...defaults()} />);
    // Q17 moved per-section explanatory text from a paragraph below
    // the controls into the title-row info-icon tooltip (title attr).
    const helpIcon = screen.getByRole("img", { name: /Reset help: Restores every Settings tab/i });
    expect(helpIcon).toBeInTheDocument();
    expect(helpIcon).toHaveAttribute("title", expect.stringContaining("first-launch defaults"));
  });
});

describe("AdvancedSection — interaction", () => {
  it("checkbox click toggles warmupShift via onChange", async () => {
    const onChange = vi.fn();
    render(<AdvancedSection {...defaults({ onChange })} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /shift warmup/i }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, warmupShift: false });
  });

  it("Reset button shows inline confirm on first click (D-06)", async () => {
    const onReset = vi.fn();
    render(<AdvancedSection {...defaults({ onReset })} />);
    await userEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByTestId("reset-confirm")).toBeInTheDocument();
    expect(screen.getByText(/Reset every Settings tab\?/)).toBeInTheDocument();
  });

  it("Confirming Reset inline invokes onReset", async () => {
    const onReset = vi.fn();
    render(<AdvancedSection {...defaults({ onReset })} />);
    await userEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    const panel = screen.getByTestId("reset-confirm");
    await userEvent.click(within(panel).getByRole("button", { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("Cancelling the Reset confirm reverts to the static button without firing onReset", async () => {
    const onReset = vi.fn();
    render(<AdvancedSection {...defaults({ onReset })} />);
    await userEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    const panel = screen.getByTestId("reset-confirm");
    await userEvent.click(within(panel).getByRole("button", { name: /cancel/i }));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reset-confirm")).toBeNull();
    expect(screen.getByRole("button", { name: /reset to defaults/i })).toBeInTheDocument();
  });
});
