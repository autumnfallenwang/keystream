import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/ipc";
import { SettingsPage, type SettingsPageProps } from "./settings-page";

const defaultSettings: Settings = {
  eventPauseMs: 10,
  modHoldMs: 10,
  warmupShift: true,
  countdownSecs: 3,
};

function defaults(overrides: Partial<SettingsPageProps> = {}): SettingsPageProps {
  return {
    settings: defaultSettings,
    onChange: vi.fn(),
    onReset: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

describe("SettingsPage — rendering", () => {
  it("renders all four dial values from props", () => {
    const settings: Settings = {
      eventPauseMs: 8,
      modHoldMs: 12,
      warmupShift: false,
      countdownSecs: 5,
    };
    render(<SettingsPage {...defaults({ settings })} />);
    // Numerical values appear next to each slider label.
    expect(screen.getByText(/8 ms/)).toBeInTheDocument();
    expect(screen.getByText(/12 ms/)).toBeInTheDocument();
    expect(screen.getByText(/5 s/)).toBeInTheDocument();
    // Checkbox state.
    const checkbox = screen.getByRole("checkbox", { name: /shift warmup/i });
    expect(checkbox).not.toBeChecked();
  });

  it("warmup checkbox shows checked when settings.warmupShift=true", () => {
    render(<SettingsPage {...defaults({ settings: { ...defaultSettings, warmupShift: true } })} />);
    expect(screen.getByRole("checkbox", { name: /shift warmup/i })).toBeChecked();
  });

  it("event-pause helper text mentions the AVD floor", () => {
    render(<SettingsPage {...defaults()} />);
    expect(screen.getByText(/Floor 7ms \(AVD\)/)).toBeInTheDocument();
  });
});

describe("SettingsPage — interaction", () => {
  it("Slider change invokes onChange with patched eventPauseMs", () => {
    const onChange = vi.fn();
    render(<SettingsPage {...defaults({ onChange })} />);
    const slider = screen.getByLabelText(/event pause/i);
    fireEvent.change(slider, { target: { value: "8" } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, eventPauseMs: 8 });
  });

  it("Modifier-hold slider patches modHoldMs", () => {
    const onChange = vi.fn();
    render(<SettingsPage {...defaults({ onChange })} />);
    const slider = screen.getByLabelText(/modifier hold/i);
    fireEvent.change(slider, { target: { value: "15" } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, modHoldMs: 15 });
  });

  it("Pre-send seconds slider patches countdownSecs", () => {
    const onChange = vi.fn();
    render(<SettingsPage {...defaults({ onChange })} />);
    const slider = screen.getByLabelText(/pre-send seconds/i);
    fireEvent.change(slider, { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, countdownSecs: 5 });
  });

  it("checkbox click toggles warmupShift via onChange", async () => {
    const onChange = vi.fn();
    render(
      <SettingsPage
        {...defaults({ settings: { ...defaultSettings, warmupShift: true }, onChange })}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /shift warmup/i }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultSettings, warmupShift: false });
  });

  it("Reset button invokes onReset", async () => {
    const onReset = vi.fn();
    render(<SettingsPage {...defaults({ onReset })} />);
    await userEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("Back button invokes onBack", async () => {
    const onBack = vi.fn();
    render(<SettingsPage {...defaults({ onBack })} />);
    await userEvent.click(screen.getByRole("button", { name: /back to text/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
