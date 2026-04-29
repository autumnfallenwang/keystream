"use client";

import { ChevronLeft, Palette, Sliders, Wrench } from "lucide-react";
import { ResizeHandle } from "./resize-handle";
import { SidebarEyebrow, SidebarRow } from "./sidebar-row";

export type SettingsTab = "appearance" | "timing" | "advanced";

export type SettingsSidebarProps = {
  activeTab: SettingsTab;
  onTabChange: (next: SettingsTab) => void;
  onBack: () => void;
  appVersion: string;
  /** Q19 — live update during drag. */
  onResize: (px: number) => void;
  /** Q19 — commit on mouseup or double-click reset. */
  onResizeCommit: (px: number) => void;
  /** Q19 — current width in px, used as drag-offset anchor. */
  currentWidthPx: number;
};

export function SettingsSidebar({
  activeTab,
  onTabChange,
  onBack,
  appVersion,
  onResize,
  onResizeCommit,
  currentWidthPx,
}: SettingsSidebarProps) {
  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-hairline bg-rail"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="pb-4 pt-7">
        <SidebarRow icon={<ChevronLeft size={16} />} onClick={onBack}>
          Back to text
        </SidebarRow>
      </div>

      <SidebarEyebrow>Settings</SidebarEyebrow>
      <SidebarRow
        icon={<Palette size={16} />}
        active={activeTab === "appearance"}
        onClick={() => onTabChange("appearance")}
      >
        Appearance
      </SidebarRow>
      <SidebarRow
        icon={<Sliders size={16} />}
        active={activeTab === "timing"}
        onClick={() => onTabChange("timing")}
      >
        Timing
      </SidebarRow>
      <SidebarRow
        icon={<Wrench size={16} />}
        active={activeTab === "advanced"}
        onClick={() => onTabChange("advanced")}
      >
        Advanced
      </SidebarRow>

      <div className="flex-1" />

      <div className="border-t border-hairline-soft py-1">
        <p className="px-5 pb-3 pt-3 font-mono text-[10px] tracking-wide text-fg-quaternary">
          v{appVersion}
        </p>
      </div>

      <ResizeHandle onResize={onResize} onCommit={onResizeCommit} currentPx={currentWidthPx} />
    </aside>
  );
}
