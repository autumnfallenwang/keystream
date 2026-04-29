"use client";

import { ChevronDown, ChevronRight, FolderOpen, Settings, Upload } from "lucide-react";
import { useState } from "react";
import type { FolderTree } from "@/lib/core/file-tree";
import { FileExplorer } from "./file-explorer";
import { ResizeHandle } from "./resize-handle";
import { SidebarRow } from "./sidebar-row";

export type SidebarProps = {
  /** Q18 — currently-loaded folder tree (null = no folder open). */
  tree: FolderTree | null;
  /** Q18 — absolute path of the currently-loaded file, or null. */
  selectedPath: string | null;
  /** Q18 — set of expanded folder paths. */
  expandedPaths: ReadonlySet<string>;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onOpenSettings: () => void;
  inSettings: boolean;
  /** Q19 — live update during drag. */
  onResize: (px: number) => void;
  /** Q19 — commit on mouseup or double-click reset. */
  onResizeCommit: (px: number) => void;
  /** Q19 — current width in px, used as drag-offset anchor. */
  currentWidthPx: number;
};

export function Sidebar({
  tree,
  selectedPath,
  expandedPaths,
  onOpenFile,
  onOpenFolder,
  onSelectFile,
  onToggleFolder,
  onOpenSettings,
  inSettings,
  onResize,
  onResizeCommit,
  currentWidthPx,
}: SidebarProps) {
  // D-10 — collapse the entire Explorer section. Distinct from the
  // per-folder collapse inside the tree itself.
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const ExplorerChevron = explorerCollapsed ? ChevronRight : ChevronDown;

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-hairline bg-rail"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="px-5 pb-4 pt-7">
        <h1 className="font-display text-[18px] font-medium tracking-tight text-fg">Keystream</h1>
      </div>

      {/* D-11 — separator above the action rows. */}
      <div className="border-t border-hairline">
        <SidebarRow icon={<Upload size={16} />} onClick={onOpenFile}>
          Open file…
        </SidebarRow>
        <SidebarRow icon={<FolderOpen size={16} />} onClick={onOpenFolder}>
          Open folder…
        </SidebarRow>
      </div>

      {/* D-10/D-11 — Explorer section header (collapsible) + body. */}
      <div className="flex flex-1 flex-col overflow-hidden border-t border-hairline">
        <button
          type="button"
          className="flex h-9 w-full items-center gap-[6px] px-[14px] text-fg-secondary transition-colors hover:bg-bg-hover"
          onClick={() => setExplorerCollapsed((v) => !v)}
          data-testid="explorer-section-toggle"
          aria-expanded={!explorerCollapsed}
        >
          <ExplorerChevron size={12} className="text-fg-tertiary" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary">
            Explorer
          </span>
        </button>
        {!explorerCollapsed && (
          <FileExplorer
            tree={tree}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
          />
        )}
      </div>

      {/* D-11 — separator above Settings. D-14 — version no longer
          rendered here; it lives in Settings → About. */}
      <div className="border-t border-hairline py-1">
        <SidebarRow icon={<Settings size={16} />} active={inSettings} onClick={onOpenSettings}>
          Settings
        </SidebarRow>
      </div>

      <ResizeHandle onResize={onResize} onCommit={onResizeCommit} currentPx={currentWidthPx} />
    </aside>
  );
}
