"use client";

import { FileText, Settings, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { ResizeHandle } from "./resize-handle";
import { SidebarEyebrow, SidebarRow } from "./sidebar-row";

export type SidebarProps = {
  onLoadFile: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  onOpenSettings: () => void;
  inSettings: boolean;
  appVersion: string;
  /** Q19 — live update during drag. */
  onResize: (px: number) => void;
  /** Q19 — commit on mouseup or double-click reset. */
  onResizeCommit: (px: number) => void;
  /** Q19 — current width in px, used as drag-offset anchor. */
  currentWidthPx: number;
};

export function Sidebar({
  onLoadFile,
  onClear,
  clearDisabled,
  onOpenSettings,
  inSettings,
  appVersion,
  onResize,
  onResizeCommit,
  currentWidthPx,
}: SidebarProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Clearing must reset the local confirm state too — otherwise after
  // a clear the row would still be in confirm mode (clearDisabled goes
  // true so the row is disabled, but state is dirty for next time).
  const doClear = () => {
    onClear();
    setConfirmingClear(false);
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-hairline bg-rail"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="px-5 pb-4 pt-7">
        <h1 className="font-display text-[18px] font-medium tracking-tight text-fg">Keystream</h1>
      </div>

      <SidebarEyebrow>Document</SidebarEyebrow>
      <SidebarRow icon={<FileText size={16} />} active={!inSettings} onClick={selectCurrent}>
        Current text
      </SidebarRow>
      <SidebarRow icon={<Upload size={16} />} onClick={onLoadFile}>
        Load file…
      </SidebarRow>
      {confirmingClear ? (
        <ClearConfirm onConfirm={doClear} onCancel={() => setConfirmingClear(false)} />
      ) : (
        <SidebarRow
          icon={<Trash2 size={16} />}
          disabled={clearDisabled}
          onClick={() => setConfirmingClear(true)}
        >
          Clear
        </SidebarRow>
      )}

      <div className="mt-5">
        <SidebarEyebrow>History</SidebarEyebrow>
        <p className="px-5 py-1 text-[12px] italic text-fg-tertiary">
          Sent texts will appear here.
        </p>
      </div>

      <div className="flex-1" />

      <div className="border-t border-hairline-soft py-1">
        <SidebarRow icon={<Settings size={16} />} active={inSettings} onClick={onOpenSettings}>
          Settings
        </SidebarRow>
        <p className="px-5 pb-3 pt-1 font-mono text-[10px] tracking-wide text-fg-quaternary">
          v{appVersion}
        </p>
      </div>

      <ResizeHandle onResize={onResize} onCommit={onResizeCommit} currentPx={currentWidthPx} />
    </aside>
  );
}

// Inline confirm for the Clear row. Keeps the same row footprint so the
// sidebar layout doesn't reflow.
function ClearConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="mx-2 my-1 rounded-md border border-alert/30 bg-alert/5 px-3 py-2"
      data-testid="clear-confirm"
    >
      <p className="text-[12px] text-fg-secondary">Clear loaded text?</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-md border border-alert bg-alert/10 px-2 py-1 text-[12px] font-medium text-alert transition-colors hover:bg-alert hover:text-canvas"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md px-2 py-1 text-[12px] text-fg-tertiary transition-colors hover:text-fg-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// "Current text" rail item is selected implicitly when not in settings.
// Future history feature will replace this with real click semantics
// (selecting a saved snippet to load into the panel).
function selectCurrent(): void {
  return;
}
