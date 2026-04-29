import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FolderTree, TreeNode } from "@/lib/core/file-tree";
import { FileExplorer, type FileExplorerProps } from "./file-explorer";

function file(path: string): TreeNode {
  const name = path.split("/").pop() ?? path;
  return { kind: "file", path, name };
}

function folder(path: string, children: TreeNode[], truncated = 0): TreeNode {
  const name = path.split("/").pop() ?? path;
  return { kind: "folder", path, name, children, truncated };
}

function makeTree(children: TreeNode[], truncated = 0): FolderTree {
  return { rootPath: "/r", rootName: "r", children, truncated };
}

function defaults(overrides: Partial<FileExplorerProps> = {}): FileExplorerProps {
  return {
    tree: null,
    selectedPath: null,
    expandedPaths: new Set<string>(),
    onSelectFile: vi.fn(),
    onToggleFolder: vi.fn(),
    ...overrides,
  };
}

describe("FileExplorer — empty states", () => {
  it("renders the no-folder empty state when tree is null", () => {
    render(<FileExplorer {...defaults()} />);
    expect(screen.getByTestId("file-explorer-empty")).toBeInTheDocument();
    expect(screen.getByText(/no file or folder loaded/i)).toBeInTheDocument();
  });

  it("renders the empty-folder state when tree.children is empty", () => {
    const tree = makeTree([]);
    render(<FileExplorer {...defaults({ tree })} />);
    expect(screen.getByTestId("file-explorer-empty-folder")).toBeInTheDocument();
    expect(screen.getByText(/\(empty folder\)/i)).toBeInTheDocument();
  });

  it("renders the root folder name as an eyebrow", () => {
    const tree = { ...makeTree([file("/r/a.ts")]), rootName: "my-project" };
    render(<FileExplorer {...defaults({ tree })} />);
    expect(screen.getByTestId("explorer-root-name")).toHaveTextContent("my-project");
  });

  it("D-09 — single-file mode shows just the loaded filename", () => {
    // No tree, but a selected file → render a one-row indicator with
    // the basename and the active-edge bar.
    render(<FileExplorer {...defaults({ tree: null, selectedPath: "/Users/me/notes.txt" })} />);
    expect(screen.getByTestId("file-explorer-single-file")).toBeInTheDocument();
    expect(screen.getByTestId("file-row-/Users/me/notes.txt")).toHaveTextContent("notes.txt");
  });
});

describe("FileExplorer — rendering rows", () => {
  it("renders file rows with the correct test-id and click handler", () => {
    const onSelectFile = vi.fn();
    const tree = makeTree([file("/r/a.ts"), file("/r/b.md")]);
    render(<FileExplorer {...defaults({ tree, onSelectFile })} />);
    const row = screen.getByTestId("file-row-/r/a.ts");
    fireEvent.click(row);
    expect(onSelectFile).toHaveBeenCalledWith("/r/a.ts");
  });

  it("renders folder rows with the correct test-id and click handler", () => {
    const onToggleFolder = vi.fn();
    const tree = makeTree([folder("/r/sub", [file("/r/sub/x.ts")])]);
    render(<FileExplorer {...defaults({ tree, onToggleFolder })} />);
    const row = screen.getByTestId("folder-row-/r/sub");
    fireEvent.click(row);
    expect(onToggleFolder).toHaveBeenCalledWith("/r/sub");
  });

  it("Q20 — every file row is clickable, including unknown extensions", () => {
    // Per Q20 the row-level allowlist is gone. Files like .png, .exe,
    // and Makefile (no extension) all get a clickable row; the UTF-8
    // check happens at read time and surfaces a warning view if the
    // content isn't text.
    const onSelectFile = vi.fn();
    const tree = makeTree([file("/r/image.png"), file("/r/Makefile"), file("/r/a.ts")]);
    render(<FileExplorer {...defaults({ tree, onSelectFile })} />);

    const png = screen.getByTestId("file-row-/r/image.png");
    expect(png).not.toBeDisabled();
    expect(png.className).not.toMatch(/cursor-not-allowed/);
    fireEvent.click(png);
    expect(onSelectFile).toHaveBeenCalledWith("/r/image.png");

    fireEvent.click(screen.getByTestId("file-row-/r/Makefile"));
    expect(onSelectFile).toHaveBeenCalledWith("/r/Makefile");
  });

  it("expanded folder shows children, collapsed folder hides them", () => {
    const tree = makeTree([folder("/r/sub", [file("/r/sub/x.ts")])]);
    const collapsed = render(<FileExplorer {...defaults({ tree })} />);
    expect(collapsed.queryByTestId("file-row-/r/sub/x.ts")).toBeNull();
    collapsed.unmount();

    render(<FileExplorer {...defaults({ tree, expandedPaths: new Set<string>(["/r/sub"]) })} />);
    expect(screen.getByTestId("file-row-/r/sub/x.ts")).toBeInTheDocument();
  });

  it("selected file row renders the active-edge bar", () => {
    const tree = makeTree([file("/r/a.ts"), file("/r/b.ts")]);
    render(<FileExplorer {...defaults({ tree, selectedPath: "/r/a.ts" })} />);
    const selected = screen.getByTestId("file-row-/r/a.ts");
    expect(selected.querySelector("[data-testid='active-edge']")).not.toBeNull();
    const other = screen.getByTestId("file-row-/r/b.ts");
    expect(other.querySelector("[data-testid='active-edge']")).toBeNull();
  });

  it("indent grows with depth (paddingLeft of nested file > top-level file)", () => {
    const tree = makeTree([file("/r/top.ts"), folder("/r/sub", [file("/r/sub/nested.ts")])]);
    render(<FileExplorer {...defaults({ tree, expandedPaths: new Set<string>(["/r/sub"]) })} />);
    const top = screen.getByTestId("file-row-/r/top.ts") as HTMLElement;
    const nested = screen.getByTestId("file-row-/r/sub/nested.ts") as HTMLElement;
    const topPad = Number.parseFloat(top.style.paddingLeft);
    const nestedPad = Number.parseFloat(nested.style.paddingLeft);
    expect(nestedPad).toBeGreaterThan(topPad);
  });

  it("renders a truncated row when a folder has truncated > 0", () => {
    const truncatedFolder = folder("/r/big", [file("/r/big/a.ts")], 100);
    const tree = makeTree([truncatedFolder]);
    render(<FileExplorer {...defaults({ tree, expandedPaths: new Set<string>(["/r/big"]) })} />);
    expect(screen.getByTestId("truncated-row")).toBeInTheDocument();
    expect(screen.getByText(/\+100 more/)).toBeInTheDocument();
  });

  it("renders a truncated row at the root when tree.truncated > 0", () => {
    const tree = makeTree([file("/r/a.ts")], 5);
    render(<FileExplorer {...defaults({ tree })} />);
    expect(screen.getByTestId("truncated-row")).toBeInTheDocument();
    expect(screen.getByText(/\+5 more/)).toBeInTheDocument();
  });

  it("file icon receives a tint color via inline style", () => {
    const tree = makeTree([file("/r/a.ts")]);
    render(<FileExplorer {...defaults({ tree })} />);
    const row = screen.getByTestId("file-row-/r/a.ts");
    const tinted = row.querySelector("span[style*='color']") as HTMLElement | null;
    expect(tinted).not.toBeNull();
    expect(tinted?.style.color).toBe("#3178c6");
  });

  it("hides empty folders that have no children and no truncation", () => {
    const tree = makeTree([folder("/r/empty", []), file("/r/keep.ts")]);
    render(<FileExplorer {...defaults({ tree })} />);
    expect(screen.queryByTestId("folder-row-/r/empty")).toBeNull();
    expect(screen.getByTestId("file-row-/r/keep.ts")).toBeInTheDocument();
  });
});
