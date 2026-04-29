import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/ipc";
import { SettingsShell, type SettingsShellProps } from "./settings-shell";

const defaultSettings: Settings = {
  eventPauseMs: 10,
  modHoldMs: 10,
  warmupShift: true,
  countdownSecs: 3,
  appearance: { profile: "atelier", mode: "system", fontSize: 1.0 },
  sidebarWidthPx: 260,
};

function defaults(overrides: Partial<SettingsShellProps> = {}): SettingsShellProps {
  return {
    settings: defaultSettings,
    onChange: vi.fn(),
    onReset: vi.fn(),
    activeTab: "appearance",
    ...overrides,
  };
}

describe("SettingsShell — header", () => {
  it("renders the Settings label in the header", () => {
    render(<SettingsShell {...defaults()} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does not render a Back button (that lives in the sidebar)", () => {
    render(<SettingsShell {...defaults()} />);
    expect(screen.queryByRole("button", { name: /back to text/i })).not.toBeInTheDocument();
  });
});

describe("SettingsShell — section switching", () => {
  it("renders Appearance section when activeTab='appearance'", () => {
    render(<SettingsShell {...defaults({ activeTab: "appearance" })} />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("UI size")).toBeInTheDocument();
  });

  it("renders Timing section when activeTab='timing'", () => {
    render(<SettingsShell {...defaults({ activeTab: "timing" })} />);
    expect(screen.getByText("Keystroke timing")).toBeInTheDocument();
    expect(screen.getByText("Countdown")).toBeInTheDocument();
    expect(screen.getByLabelText(/event pause/i)).toBeInTheDocument();
  });

  it("renders Advanced section when activeTab='advanced'", () => {
    render(<SettingsShell {...defaults({ activeTab: "advanced" })} />);
    expect(screen.getByRole("checkbox", { name: /shift warmup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset to defaults/i })).toBeInTheDocument();
  });

  it("only renders the active section, not the others", () => {
    render(<SettingsShell {...defaults({ activeTab: "advanced" })} />);
    // Appearance markers
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    // Timing markers
    expect(screen.queryByLabelText(/event pause/i)).not.toBeInTheDocument();
  });
});

describe("SettingsShell — onChange wraps appearance", () => {
  it("appearance changes get wrapped into the full Settings object", async () => {
    const onChange = vi.fn();
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<SettingsShell {...defaults({ activeTab: "appearance", onChange })} />);
    await userEvent.click(screen.getByRole("button", { name: /Solarized/ }));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultSettings,
      appearance: { ...defaultSettings.appearance, profile: "solarized" },
    });
  });
});
