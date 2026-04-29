import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsSidebar, type SettingsSidebarProps, type SettingsTab } from "./settings-sidebar";

function defaults(overrides: Partial<SettingsSidebarProps> = {}): SettingsSidebarProps {
  return {
    activeTab: "appearance",
    onTabChange: vi.fn(),
    onBack: vi.fn(),
    appVersion: "0.1.0",
    ...overrides,
  };
}

describe("SettingsSidebar — rendering", () => {
  it("renders the Back to text row", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.getByRole("button", { name: /back to text/i })).toBeInTheDocument();
  });

  it("renders the SETTINGS eyebrow", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders all three tabs", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
  });

  it("renders the version footer", () => {
    render(<SettingsSidebar {...defaults({ appVersion: "0.2.5" })} />);
    expect(screen.getByText("v0.2.5")).toBeInTheDocument();
  });
});

describe("SettingsSidebar — active marker", () => {
  it.each<SettingsTab>([
    "appearance",
    "timing",
    "advanced",
  ])("marks %s as active when activeTab is set", (tab) => {
    const labelMap: Record<SettingsTab, string> = {
      appearance: "Appearance",
      timing: "Timing",
      advanced: "Advanced",
    };
    render(<SettingsSidebar {...defaults({ activeTab: tab })} />);
    const button = screen.getByRole("button", { name: labelMap[tab] });
    expect(within(button).getByTestId("active-edge")).toBeInTheDocument();
  });

  it("only one tab has the active edge at a time", () => {
    render(<SettingsSidebar {...defaults({ activeTab: "timing" })} />);
    const edges = screen.getAllByTestId("active-edge");
    expect(edges).toHaveLength(1);
  });
});

describe("SettingsSidebar — interaction", () => {
  it("clicking Back invokes onBack", async () => {
    const onBack = vi.fn();
    render(<SettingsSidebar {...defaults({ onBack })} />);
    await userEvent.click(screen.getByRole("button", { name: /back to text/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each<SettingsTab>([
    "appearance",
    "timing",
    "advanced",
  ])("clicking %s tab invokes onTabChange with that tab", async (tab) => {
    const onTabChange = vi.fn();
    const labelMap: Record<SettingsTab, string> = {
      appearance: "Appearance",
      timing: "Timing",
      advanced: "Advanced",
    };
    // Start on a different tab so the click is meaningful.
    const startTab: SettingsTab = tab === "appearance" ? "timing" : "appearance";
    render(<SettingsSidebar {...defaults({ activeTab: startTab, onTabChange })} />);
    await userEvent.click(screen.getByRole("button", { name: labelMap[tab] }));
    expect(onTabChange).toHaveBeenCalledWith(tab);
  });
});
