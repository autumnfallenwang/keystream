import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar, type SidebarProps } from "./sidebar";

function defaults(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    onLoadFile: vi.fn(),
    onClear: vi.fn(),
    clearDisabled: false,
    onOpenSettings: vi.fn(),
    inSettings: false,
    appVersion: "0.1.0",
    ...overrides,
  };
}

describe("Sidebar", () => {
  it("renders the wordmark", () => {
    render(<Sidebar {...defaults()} />);
    expect(screen.getByText("Keystream")).toBeInTheDocument();
  });

  it("renders the app version label", () => {
    render(<Sidebar {...defaults({ appVersion: "1.2.3" })} />);
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
  });

  it("Current text rail item is active when not in settings", () => {
    render(<Sidebar {...defaults({ inSettings: false })} />);
    const current = screen.getByRole("button", { name: /current text/i });
    // Active rail items render an active-edge bar.
    expect(within(current).getByTestId("active-edge")).toBeInTheDocument();
  });

  it("Settings rail item is active when in settings", () => {
    render(<Sidebar {...defaults({ inSettings: true })} />);
    const settings = screen.getByRole("button", { name: /settings/i });
    expect(within(settings).getByTestId("active-edge")).toBeInTheDocument();
  });

  it("Load file button invokes onLoadFile", async () => {
    const onLoadFile = vi.fn();
    render(<Sidebar {...defaults({ onLoadFile })} />);
    await userEvent.click(screen.getByRole("button", { name: /load file/i }));
    expect(onLoadFile).toHaveBeenCalledOnce();
  });

  it("Clear button invokes onClear when enabled", async () => {
    const onClear = vi.fn();
    render(<Sidebar {...defaults({ onClear, clearDisabled: false })} />);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("Clear button is disabled when clearDisabled=true", () => {
    render(<Sidebar {...defaults({ clearDisabled: true })} />);
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
  });

  it("Settings rail item invokes onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar {...defaults({ onOpenSettings })} />);
    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
