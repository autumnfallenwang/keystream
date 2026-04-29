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
    onResize: vi.fn(),
    onResizeCommit: vi.fn(),
    currentWidthPx: 260,
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

  it("Clear button shows inline confirm on first click (D-06)", async () => {
    const onClear = vi.fn();
    render(<Sidebar {...defaults({ onClear, clearDisabled: false })} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    // First click does NOT invoke onClear — it surfaces the confirm.
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByTestId("clear-confirm")).toBeInTheDocument();
    expect(screen.getByText(/Clear loaded text\?/)).toBeInTheDocument();
  });

  it("Confirming Clear inline invokes onClear", async () => {
    const onClear = vi.fn();
    render(<Sidebar {...defaults({ onClear, clearDisabled: false })} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    // After surfacing the confirm panel, click the destructive Clear button
    // INSIDE the panel.
    const panel = screen.getByTestId("clear-confirm");
    await userEvent.click(within(panel).getByRole("button", { name: /^clear$/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("Cancelling the Clear confirm reverts to the rail row without firing onClear", async () => {
    const onClear = vi.fn();
    render(<Sidebar {...defaults({ onClear, clearDisabled: false })} />);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    const panel = screen.getByTestId("clear-confirm");
    await userEvent.click(within(panel).getByRole("button", { name: /cancel/i }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByTestId("clear-confirm")).toBeNull();
    // Original Clear rail row is back.
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  });

  it("Clear button is disabled when clearDisabled=true", () => {
    render(<Sidebar {...defaults({ clearDisabled: true })} />);
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeDisabled();
  });

  it("Settings rail item invokes onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar {...defaults({ onOpenSettings })} />);
    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("Q19: renders the resize handle", () => {
    render(<Sidebar {...defaults()} />);
    expect(screen.getByTestId("sidebar-resize-handle")).toBeInTheDocument();
  });

  it("Q19: aside uses --sidebar-width CSS var for its width", () => {
    const { container } = render(<Sidebar {...defaults()} />);
    const aside = container.querySelector("aside");
    expect(aside?.style.width).toBe("var(--sidebar-width)");
  });
});
