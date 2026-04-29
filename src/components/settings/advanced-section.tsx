"use client";

import { useState } from "react";
import type { Settings } from "@/lib/ipc";
import { Checkbox, SettingsSection } from "./section-primitives";

export type AdvancedSectionProps = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
};

export function AdvancedSection({ settings, onChange, onReset }: AdvancedSectionProps) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const [confirmingReset, setConfirmingReset] = useState(false);

  const doReset = () => {
    onReset();
    setConfirmingReset(false);
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Keystroke"
        help="Tunables for the keystroke pipeline. Defaults are RDP-validated; you generally don't need to change these."
      >
        <Checkbox
          label="Shift warmup"
          checked={settings.warmupShift}
          onChange={(v) => set({ warmupShift: v })}
          helper="Sends a dummy shift press during countdown to stabilize modifier state. Recommended on."
        />
      </SettingsSection>

      <SettingsSection
        title="Reset"
        help="Restores every Settings tab (Appearance, Timing, Advanced) to first-launch defaults. Inline confirm prevents accidental wipes."
        card={false}
      >
        {confirmingReset ? (
          <div
            className="rounded-md border border-alert/30 bg-alert/5 px-4 py-3"
            data-testid="reset-confirm"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">Reset every Settings tab?</p>
                <p className="mt-0.5 text-[12px] text-fg-tertiary">
                  Wipes Timing, Appearance, and Advanced back to first-launch defaults. Cannot be
                  undone (but you can re-tune anytime).
                </p>
              </div>
              <button
                type="button"
                onClick={doReset}
                className="shrink-0 rounded-md border border-alert bg-alert/10 px-3 py-1.5 text-[12px] font-medium text-alert transition-colors hover:bg-alert hover:text-canvas"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="shrink-0 rounded-md px-3 py-1.5 text-[12px] text-fg-tertiary transition-colors hover:text-fg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="rounded-md border border-hairline-strong bg-canvas px-4 py-2 text-[13px] text-fg-secondary transition-colors hover:border-alert/40 hover:bg-alert/5 hover:text-alert"
          >
            Reset to defaults
          </button>
        )}
      </SettingsSection>
    </div>
  );
}
