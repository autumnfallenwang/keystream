"use client";

import { ChevronLeft, Info, Palette, Sliders, Wrench } from "lucide-react";
import { SidebarEyebrow, SidebarRow } from "./sidebar-row";

export type SettingsTab = "appearance" | "timing" | "advanced" | "about";

export type SettingsSidebarProps = {
  activeTab: SettingsTab;
  onTabChange: (next: SettingsTab) => void;
  onBack: () => void;
};

export function SettingsSidebar({ activeTab, onTabChange, onBack }: SettingsSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-hairline bg-rail">
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
      <SidebarRow
        icon={<Info size={16} />}
        active={activeTab === "about"}
        onClick={() => onTabChange("about")}
      >
        About
      </SidebarRow>

      <div className="flex-1" />

      {/* D-14 — version footer retired; version + updater live in
          Settings → About. */}
    </aside>
  );
}
