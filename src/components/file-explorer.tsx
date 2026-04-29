"use client";

// Q18 — VSCode-style file explorer for the sidebar's middle region.
//
// Renders a `FolderTree` from `read_folder_tree` as a collapsible
// indented tree. Folders toggle on click; files load on click (only
// text-allowlist files are clickable, others render dimmed + inert).
//
// Empty folders (no children, no truncation) are pruned for VSCode
// parity. Depth-truncated folders are kept and rendered with a
// "(+N more)" footer row inside.

import {
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  Container,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  KeyRound,
  Palette,
  Settings2,
  Terminal,
} from "lucide-react";
import {
  classifyIcon,
  type FolderTree,
  type IconKind,
  isExpanded,
  pruneEmptyFolders,
  type TreeNode,
} from "@/lib/core/file-tree";

const TINT: Partial<Record<IconKind, string>> = {
  ts: "#3178c6",
  rs: "#dea584",
  py: "#3572a5",
  go: "#00add8",
  js: "#f7df1e",
  html: "#e34c26",
  css: "#264de4",
  dockerfile: "#0db7ed",
};

// Map IconKind → which lucide component renders the row icon. Keep
// outline icons throughout — colour is applied via inline style only.
function iconForKind(kind: IconKind) {
  switch (kind) {
    case "ts":
    case "rs":
    case "py":
    case "go":
    case "js":
      return FileCode2;
    case "json":
      return Braces;
    case "yaml":
      return Settings2;
    case "md":
      return FileText;
    case "html":
      return Code2;
    case "css":
      return Palette;
    case "shell":
      return Terminal;
    case "dockerfile":
      return Container;
    case "env":
      return KeyRound;
    case "text":
      return FileText;
  }
}

// Some kinds use the project's design tokens, not a brand colour.
function defaultColorForKind(kind: IconKind): string {
  switch (kind) {
    case "json":
    case "yaml":
    case "text":
      return "var(--fg-tertiary)";
    case "md":
    case "shell":
      return "var(--fg-secondary)";
    case "env":
      return "var(--warn)";
    default:
      return "var(--fg-tertiary)";
  }
}

export type FileExplorerProps = {
  /** null = no folder loaded yet (the user hasn't clicked Open folder). */
  tree: FolderTree | null;
  /** Currently-loaded file's absolute path; null if none. */
  selectedPath: string | null;
  /** Set of folder paths the user has expanded. */
  expandedPaths: ReadonlySet<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
};

export function FileExplorer({
  tree,
  selectedPath,
  expandedPaths,
  onSelectFile,
  onToggleFolder,
}: FileExplorerProps) {
  if (tree === null) {
    // Single-file mode: a file was opened via "Open file…" without a
    // folder context. Show a one-row indicator so the user can see at
    // a glance which file is active.
    if (selectedPath !== null) {
      const name = selectedPath.split(/[\\/]/).pop() ?? selectedPath;
      return (
        <div className="flex flex-1 flex-col" data-testid="file-explorer-single-file">
          <SingleFileRow path={selectedPath} name={name} onSelectFile={onSelectFile} />
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-1 px-5 py-3" data-testid="file-explorer-empty">
        <p className="text-[12px] italic text-fg-tertiary">No file or folder loaded.</p>
        <p className="text-[12px] text-fg-quaternary">
          Open a file or folder above to browse its contents.
        </p>
      </div>
    );
  }

  const pruned = pruneEmptyFolders(tree);

  if (pruned.children.length === 0 && tree.truncated === 0) {
    return (
      <div className="flex flex-1 flex-col px-5 py-3" data-testid="file-explorer-empty-folder">
        <p
          className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary"
          data-testid="explorer-root-name"
        >
          {tree.rootName}
        </p>
        <p className="mt-1 text-[12px] italic text-fg-quaternary">(empty folder)</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto"
      style={{ overscrollBehavior: "none" }}
      data-testid="file-explorer"
    >
      <p
        className="px-5 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary"
        data-testid="explorer-root-name"
      >
        {tree.rootName}
      </p>
      <div>
        {pruned.children.map((node) => (
          <TreeRowRenderer
            key={node.path}
            node={node}
            level={0}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
          />
        ))}
        {pruned.truncated > 0 && <TruncatedRow level={0} count={pruned.truncated} />}
      </div>
    </div>
  );
}

type TreeRowRendererProps = {
  node: TreeNode;
  level: number;
  selectedPath: string | null;
  expandedPaths: ReadonlySet<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
};

function TreeRowRenderer({
  node,
  level,
  selectedPath,
  expandedPaths,
  onSelectFile,
  onToggleFolder,
}: TreeRowRendererProps) {
  if (node.kind === "file") {
    return (
      <FileRow
        node={node}
        level={level}
        selected={selectedPath === node.path}
        onSelectFile={onSelectFile}
      />
    );
  }
  const expanded = isExpanded(expandedPaths, node.path);
  return (
    <>
      <FolderRow node={node} level={level} expanded={expanded} onToggleFolder={onToggleFolder} />
      {expanded &&
        node.children.map((child) => (
          <TreeRowRenderer
            key={child.path}
            node={child}
            level={level + 1}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
          />
        ))}
      {expanded && node.truncated > 0 && <TruncatedRow level={level + 1} count={node.truncated} />}
    </>
  );
}

// Tree geometry — VSCode-ish but with our 12px indent (Q18 spec).
const ROW_BASE_PADDING_LEFT = 14; // matches sidebar-row px-[14px]
const PER_LEVEL_INDENT = 12;
const FILE_CHEVRON_SPACER = 14; // files reserve this so they line up with folders

function indentForFile(level: number): number {
  return ROW_BASE_PADDING_LEFT + level * PER_LEVEL_INDENT + FILE_CHEVRON_SPACER;
}
function indentForFolder(level: number): number {
  return ROW_BASE_PADDING_LEFT + level * PER_LEVEL_INDENT;
}

function FileRow({
  node,
  level,
  selected,
  onSelectFile,
}: {
  node: Extract<TreeNode, { kind: "file" }>;
  level: number;
  selected: boolean;
  onSelectFile: (path: string) => void;
}) {
  // Q20 — every file row is clickable. The UTF-8 / size check happens
  // at read-time; binary files surface a warning view rather than
  // being blocked at the row level.
  const kind = classifyIcon(node.name);
  const Icon = iconForKind(kind);
  const tint = TINT[kind] ?? defaultColorForKind(kind);

  let classes =
    "relative flex h-[22px] w-full items-center gap-[6px] text-[13px] transition-colors";
  if (selected) {
    classes += " bg-bg-active text-fg";
  } else {
    classes += " text-fg-secondary hover:bg-bg-hover";
  }

  return (
    <button
      type="button"
      className={classes}
      style={{ paddingLeft: indentForFile(level), paddingRight: 8 }}
      data-testid={`file-row-${node.path}`}
      onClick={() => onSelectFile(node.path)}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] bg-accent"
          data-testid="active-edge"
        />
      )}
      <span style={{ color: tint, display: "inline-flex" }}>
        <Icon size={14} />
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function FolderRow({
  node,
  level,
  expanded,
  onToggleFolder,
}: {
  node: Extract<TreeNode, { kind: "folder" }>;
  level: number;
  expanded: boolean;
  onToggleFolder: (path: string) => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const FolderIcon = expanded ? FolderOpen : Folder;
  return (
    <button
      type="button"
      className="relative flex h-[22px] w-full items-center gap-[4px] text-[13px] text-fg-secondary transition-colors hover:bg-bg-hover"
      style={{ paddingLeft: indentForFolder(level), paddingRight: 8 }}
      data-testid={`folder-row-${node.path}`}
      onClick={() => onToggleFolder(node.path)}
    >
      <Chevron size={12} className="text-fg-tertiary" />
      <span style={{ color: "var(--fg-secondary)", display: "inline-flex" }}>
        <FolderIcon size={14} />
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// D-09 — Single-file mode row. Shown when a file is loaded via
// "Open file…" without a folder context. Behaves identically to a
// tree file row: clickable, selected styling, active-edge bar. Click
// re-fires onSelectFile (which re-reads + re-loads) — useful if the
// file changed on disk since the original open.
function SingleFileRow({
  path,
  name,
  onSelectFile,
}: {
  path: string;
  name: string;
  onSelectFile: (path: string) => void;
}) {
  const kind = classifyIcon(name);
  const Icon = iconForKind(kind);
  const tint = TINT[kind] ?? defaultColorForKind(kind);
  return (
    <button
      type="button"
      className="relative flex h-[22px] w-full items-center gap-[6px] bg-bg-active px-[14px] text-[13px] text-fg transition-colors"
      data-testid={`file-row-${path}`}
      onClick={() => onSelectFile(path)}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px] bg-accent"
        data-testid="active-edge"
      />
      <span style={{ color: tint, display: "inline-flex" }}>
        <Icon size={14} />
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function TruncatedRow({ level, count }: { level: number; count: number }) {
  return (
    <div
      className="flex h-[22px] items-center text-[12px] italic text-fg-quaternary"
      style={{ paddingLeft: indentForFile(level), paddingRight: 8, cursor: "not-allowed" }}
      data-testid="truncated-row"
    >
      (+{count} more)
    </div>
  );
}
