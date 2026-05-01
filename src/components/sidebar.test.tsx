import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FolderTree } from "@/lib/core/file-tree";
import { Sidebar, type SidebarProps } from "./sidebar";

function defaults(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    tree: null,
    selectedPath: null,
    expandedPaths: new Set<string>(),
    onOpenFile: vi.fn(),
    onOpenFolder: vi.fn(),
    onSelectFile: vi.fn(),
    onToggleFolder: vi.fn(),
    onRefreshExplorer: vi.fn(),
    canRefreshExplorer: false,
    onOpenSettings: vi.fn(),
    inSettings: false,
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

  it("D-14: does NOT render an app-version label (moved to Settings → About)", () => {
    render(<Sidebar {...defaults()} />);
    expect(screen.queryByText(/^v\d/)).toBeNull();
  });

  it("Open file button invokes onOpenFile", async () => {
    const onOpenFile = vi.fn();
    render(<Sidebar {...defaults({ onOpenFile })} />);
    await userEvent.click(screen.getByRole("button", { name: /open file/i }));
    expect(onOpenFile).toHaveBeenCalledOnce();
  });

  it("Open folder button invokes onOpenFolder", async () => {
    const onOpenFolder = vi.fn();
    render(<Sidebar {...defaults({ onOpenFolder })} />);
    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledOnce();
  });

  it("Settings rail item is active when in settings", () => {
    render(<Sidebar {...defaults({ inSettings: true })} />);
    const settings = screen.getByRole("button", { name: /settings/i });
    expect(within(settings).getByTestId("active-edge")).toBeInTheDocument();
  });

  it("Settings rail item invokes onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar {...defaults({ onOpenSettings })} />);
    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("renders the file explorer empty state when tree is null", () => {
    render(<Sidebar {...defaults({ tree: null })} />);
    expect(screen.getByTestId("file-explorer-empty")).toBeInTheDocument();
  });

  it("explorer refresh icon is disabled when canRefreshExplorer is false", () => {
    render(<Sidebar {...defaults({ canRefreshExplorer: false })} />);
    const btn = screen.getByTestId("explorer-refresh") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("explorer refresh icon invokes onRefreshExplorer when enabled", async () => {
    const onRefreshExplorer = vi.fn();
    render(<Sidebar {...defaults({ onRefreshExplorer, canRefreshExplorer: true })} />);
    await userEvent.click(screen.getByTestId("explorer-refresh"));
    expect(onRefreshExplorer).toHaveBeenCalledOnce();
  });

  it("clicking the refresh icon does not toggle the Explorer collapse", async () => {
    const onRefreshExplorer = vi.fn();
    render(<Sidebar {...defaults({ onRefreshExplorer, canRefreshExplorer: true })} />);
    const toggle = screen.getByTestId("explorer-section-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(screen.getByTestId("explorer-refresh"));
    // Collapse should still be open after refresh click.
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders the file explorer with the supplied tree", () => {
    const tree: FolderTree = {
      rootPath: "/proj",
      rootName: "proj",
      children: [{ kind: "file", path: "/proj/a.ts", name: "a.ts" }],
      truncated: 0,
    };
    render(<Sidebar {...defaults({ tree })} />);
    expect(screen.getByTestId("file-explorer")).toBeInTheDocument();
    expect(screen.getByTestId("file-row-/proj/a.ts")).toBeInTheDocument();
  });

  it("D-10 — renders the Explorer section header with collapse toggle", () => {
    render(<Sidebar {...defaults()} />);
    const toggle = screen.getByTestId("explorer-section-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent(/Explorer/i);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("D-10 — clicking the Explorer header toggles its body", async () => {
    const tree: FolderTree = {
      rootPath: "/proj",
      rootName: "proj",
      children: [{ kind: "file", path: "/proj/a.ts", name: "a.ts" }],
      truncated: 0,
    };
    render(<Sidebar {...defaults({ tree })} />);
    expect(screen.getByTestId("file-explorer")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("explorer-section-toggle"));
    expect(screen.queryByTestId("file-explorer")).toBeNull();
    expect(screen.getByTestId("explorer-section-toggle")).toHaveAttribute("aria-expanded", "false");
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
