import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsSidebar, type SettingsSidebarProps, type SettingsTab } from "./settings-sidebar";

function defaults(overrides: Partial<SettingsSidebarProps> = {}): SettingsSidebarProps {
  return {
    activeTab: "appearance",
    onTabChange: vi.fn(),
    onBack: vi.fn(),
    onResize: vi.fn(),
    onResizeCommit: vi.fn(),
    currentWidthPx: 260,
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

  it("renders all four tabs", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About" })).toBeInTheDocument();
  });

  it("D-14: does NOT render an app-version footer (moved to Settings → About)", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.queryByText(/^v\d/)).toBeNull();
  });
});

const TAB_LABELS: Record<SettingsTab, string> = {
  appearance: "Appearance",
  timing: "Timing",
  advanced: "Advanced",
  about: "About",
};

describe("SettingsSidebar — active marker", () => {
  it.each<SettingsTab>([
    "appearance",
    "timing",
    "advanced",
    "about",
  ])("marks %s as active when activeTab is set", (tab) => {
    render(<SettingsSidebar {...defaults({ activeTab: tab })} />);
    const button = screen.getByRole("button", { name: TAB_LABELS[tab] });
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
    "about",
  ])("clicking %s tab invokes onTabChange with that tab", async (tab) => {
    const onTabChange = vi.fn();
    // Start on a different tab so the click is meaningful.
    const startTab: SettingsTab = tab === "appearance" ? "timing" : "appearance";
    render(<SettingsSidebar {...defaults({ activeTab: startTab, onTabChange })} />);
    await userEvent.click(screen.getByRole("button", { name: TAB_LABELS[tab] }));
    expect(onTabChange).toHaveBeenCalledWith(tab);
  });
});

describe("SettingsSidebar — Q19 resize", () => {
  it("renders the resize handle", () => {
    render(<SettingsSidebar {...defaults()} />);
    expect(screen.getByTestId("sidebar-resize-handle")).toBeInTheDocument();
  });

  it("aside uses --sidebar-width CSS var for its width", () => {
    const { container } = render(<SettingsSidebar {...defaults()} />);
    const aside = container.querySelector("aside");
    expect(aside?.style.width).toBe("var(--sidebar-width)");
  });
});
