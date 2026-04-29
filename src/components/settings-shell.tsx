"use client";

import { useState } from "react";
import type { AppearanceCfg } from "@/lib/core/appearance";
import type { Settings } from "@/lib/ipc";
import { AdvancedSection } from "./settings/advanced-section";
import { AppearanceSection } from "./settings/appearance-section";
import { TimingSection } from "./settings/timing-section";
import type { SettingsTab } from "./settings-sidebar";

export type SettingsShellProps = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  activeTab: SettingsTab;
};

export function SettingsShell({ settings, onChange, onReset, activeTab }: SettingsShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center justify-end border-b border-hairline bg-canvas px-[18px]">
        <span className="text-[13px] text-fg-secondary">Settings</span>
      </header>

      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto max-w-[520px]">
          {activeTab === "appearance" && (
            <AppearanceSection
              appearance={settings.appearance}
              onChange={(next: AppearanceCfg) => onChange({ ...settings, appearance: next })}
            />
          )}
          {activeTab === "timing" && <TimingSection settings={settings} onChange={onChange} />}
          {activeTab === "advanced" && (
            <AdvancedSection settings={settings} onChange={onChange} onReset={onReset} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Convenience hook: owns sub-tab state. The page passes the value
 * back into both the shell and the sidebar, and the sidebar's
 * `onTabChange` calls the setter. */
export function useSettingsTab(initial: SettingsTab = "appearance"): {
  activeTab: SettingsTab;
  setActiveTab: (next: SettingsTab) => void;
} {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initial);
  return { activeTab, setActiveTab };
}
