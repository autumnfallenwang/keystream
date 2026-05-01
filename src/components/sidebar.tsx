"use client";

import { ChevronDown, ChevronRight, FolderOpen, RefreshCw, Settings, Upload } from "lucide-react";
import { useState } from "react";
import type { FolderTree } from "@/lib/core/file-tree";
import { FileExplorer } from "./file-explorer";
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
  /** Re-read whatever is currently loaded (single file or folder
   * tree) from disk. Disabled when nothing is loaded. */
  onRefreshExplorer: () => void;
  /** True iff there's something to refresh (single file or folder). */
  canRefreshExplorer: boolean;
  onOpenSettings: () => void;
  inSettings: boolean;
};

export function Sidebar({
  tree,
  selectedPath,
  expandedPaths,
  onOpenFile,
  onOpenFolder,
  onSelectFile,
  onToggleFolder,
  onRefreshExplorer,
  canRefreshExplorer,
  onOpenSettings,
  inSettings,
}: SidebarProps) {
  // D-10 — collapse the entire Explorer section. Distinct from the
  // per-folder collapse inside the tree itself.
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const ExplorerChevron = explorerCollapsed ? ChevronRight : ChevronDown;

  return (
    <aside className="flex h-full w-full flex-col border-r border-hairline bg-rail">
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
        <div className="flex h-9 items-center text-fg-secondary">
          <button
            type="button"
            className="flex h-full flex-1 items-center gap-[6px] px-[14px] transition-colors hover:bg-bg-hover"
            onClick={() => setExplorerCollapsed((v) => !v)}
            data-testid="explorer-section-toggle"
            aria-expanded={!explorerCollapsed}
          >
            <ExplorerChevron size={12} className="text-fg-tertiary" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary">
              Explorer
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canRefreshExplorer) onRefreshExplorer();
            }}
            disabled={!canRefreshExplorer}
            data-testid="explorer-refresh"
            title={canRefreshExplorer ? "Refresh from disk" : "Nothing loaded"}
            aria-label="Refresh explorer"
            className="mr-[10px] flex h-6 w-6 items-center justify-center rounded text-fg-tertiary transition-colors hover:bg-bg-hover hover:text-fg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-tertiary"
          >
            <RefreshCw size={12} />
          </button>
        </div>
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
    </aside>
  );
}
