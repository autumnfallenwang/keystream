import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/ipc";
import { TimingSection, type TimingSectionProps } from "./timing-section";

const defaultSettings: Settings = {
  eventPauseMs: 10,
  modHoldMs: 10,
  warmupShift: true,
  countdownSecs: 3,
  appearance: { profile: "atelier", mode: "system", fontSize: 1.0, editorFontSize: 13 },
  sidebarWidthPx: 260,
};

function defaults(overrides: Partial<TimingSectionProps> = {}): TimingSectionProps {
  return {
    settings: defaultSettings,
    onChange: vi.fn(),
    ...overrides,
  };
}

describe("TimingSection — rendering", () => {
  it("renders the three input values from props", () => {
    const settings: Settings = {
      ...defaultSettings,
      eventPauseMs: 8,
      modHoldMs: 12,
      countdownSecs: 5,
    };
    render(<TimingSection {...defaults({ settings })} />);
    expect((screen.getByLabelText(/event pause/i) as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText(/modifier hold/i) as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText(/pre-send seconds/i) as HTMLInputElement).value).toBe("5");
  });

  it("event-pause helper text mentions the RDP floor", () => {
    render(<TimingSection {...defaults()} />);
    expect(screen.getByText(/Floor 7ms \(RDP\)/)).toBeInTheDocument();
  });

  it("each input shows its range hint with floor + suggested value", () => {
    render(<TimingSection {...defaults()} />);
    // Event pause: min 5, suggested 10
    expect(screen.getAllByText(/min 5 · suggested 10/).length).toBeGreaterThanOrEqual(2);
    // Pre-send seconds: min 1, suggested 3
    expect(screen.getByText(/min 1 · suggested 3/)).toBeInTheDocument();
  });
});

describe("TimingSection — interaction (commit on Enter)", () => {
  it("Event pause input commits on Enter and patches eventPauseMs", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/event pause/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8" } });
    expect(onChange).not.toHaveBeenCalled(); // typing alone doesn't commit
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, eventPauseMs: 8 });
  });

  it("Modifier hold input commits on blur", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/modifier hold/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, modHoldMs: 15 });
  });

  it("Pre-send seconds input commits on Enter", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/pre-send seconds/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, countdownSecs: 5 });
  });
});

describe("TimingSection — clamping", () => {
  it("below-floor input clamps up to the floor on commit", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/event pause/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, eventPauseMs: 5 });
    expect(input.value).toBe("5");
  });

  it("countdown below 1s clamps to 1s on commit", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/pre-send seconds/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, countdownSecs: 1 });
  });

  it("non-numeric input reverts to the saved value (no commit)", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/event pause/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("10"); // back to the saved default
  });

  it("non-integer input rounds on commit", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/event pause/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12.7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, eventPauseMs: 13 });
  });

  it("typing the same value as saved is a no-op", () => {
    const onChange = vi.fn();
    render(<TimingSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText(/event pause/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
