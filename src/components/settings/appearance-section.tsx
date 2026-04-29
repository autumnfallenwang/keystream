"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  type AppearanceCfg,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_PRESETS,
  isScaleNear,
  PROFILE_DESCRIPTIONS,
  PROFILE_LABELS,
  parseFontSize,
  THEME_PROFILES,
  type ThemeMode,
  type ThemeProfile,
} from "@/lib/core/appearance";
import { SettingsSection } from "./section-primitives";

export type AppearanceSectionProps = {
  appearance: AppearanceCfg;
  onChange: (next: AppearanceCfg) => void;
};

const MODE_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
  { value: "system", label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
];

function scaleToPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function AppearanceSection({ appearance, onChange }: AppearanceSectionProps) {
  // Draft state for the custom % input — typing intermediate values
  // doesn't fire onChange until Enter or blur.
  const [percentDraft, setPercentDraft] = useState<string>(
    String(scaleToPercent(appearance.fontSize)),
  );

  // When the underlying fontSize prop changes (e.g. preset click,
  // global Reset), sync the input.
  useEffect(() => {
    setPercentDraft(String(scaleToPercent(appearance.fontSize)));
  }, [appearance.fontSize]);

  const setProfile = (profile: ThemeProfile) => {
    if (profile === appearance.profile) return;
    onChange({ ...appearance, profile });
  };

  const setMode = (mode: ThemeMode) => {
    if (mode === appearance.mode) return;
    onChange({ ...appearance, mode });
  };

  const setFontSize = (fontSize: number) => {
    if (isScaleNear(fontSize, appearance.fontSize)) return;
    onChange({ ...appearance, fontSize });
  };

  const commitPercent = () => {
    const pct = Number.parseFloat(percentDraft);
    if (!Number.isFinite(pct)) {
      setPercentDraft(String(scaleToPercent(appearance.fontSize)));
      return;
    }
    setFontSize(parseFontSize(pct / 100));
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Profile"
        help="Five curated palettes. Pick the one that matches your eye; descriptions below preview each."
        card={false}
      >
        <div className="divide-y divide-hairline-soft overflow-hidden rounded-md border border-hairline bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {THEME_PROFILES.map((p) => {
            const active = p === appearance.profile;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => setProfile(p)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  active ? "bg-bg-active text-fg" : "text-fg-secondary hover:bg-bg-hover"
                }`}
              >
                <span
                  className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                    active ? "bg-accent" : "bg-fg-quaternary"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] ${active ? "font-medium" : ""}`}>
                    {PROFILE_LABELS[p]}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-fg-tertiary">
                    {PROFILE_DESCRIPTIONS[p]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Mode"
        help="System follows your OS light/dark preference live. Light and Dark lock the app regardless of the OS."
      >
        <div className="inline-flex rounded-md border border-hairline bg-canvas p-1">
          {MODE_OPTIONS.map((opt) => {
            const active = opt.value === appearance.mode;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={opt.label}
                onClick={() => setMode(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-bg-active font-medium text-fg"
                    : "text-fg-tertiary hover:text-fg-secondary"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="UI size"
        help="Scales text, icons, spacing, and borders proportionally. Pick a preset or type a custom percentage between 50 and 200."
      >
        <div className="space-y-3">
          <div className="inline-flex rounded-md border border-hairline bg-canvas p-1">
            {FONT_SIZE_PRESETS.map((preset) => {
              const active = isScaleNear(appearance.fontSize, preset.value);
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  aria-label={preset.label}
                  onClick={() => setFontSize(preset.value)}
                  className={`inline-flex items-center rounded-[5px] px-3 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-bg-active font-medium text-fg"
                      : "text-fg-tertiary hover:text-fg-secondary"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="font-size-custom" className="text-[12px] text-fg-tertiary">
              Custom
            </label>
            <input
              id="font-size-custom"
              type="number"
              min={Math.round(FONT_SIZE_MIN * 100)}
              max={Math.round(FONT_SIZE_MAX * 100)}
              step={5}
              value={percentDraft}
              onChange={(e) => setPercentDraft(e.target.value)}
              onBlur={commitPercent}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPercent();
                }
              }}
              className="h-8 w-20 rounded-md border border-hairline bg-canvas px-2 font-code text-[13px] tabular-nums text-fg outline-none focus:border-accent"
            />
            <span className="text-[11px] text-fg-tertiary">% (press Enter to apply)</span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
