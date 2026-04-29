"use client";

import type { Settings } from "@/lib/ipc";
import { NumberInput, SettingsSection } from "./section-primitives";

export type TimingSectionProps = {
  settings: Settings;
  onChange: (next: Settings) => void;
};

export function TimingSection({ settings, onChange }: TimingSectionProps) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Keystroke timing"
        help="How fast Keystream posts each keystroke. Faster is more efficient but increases the chance of dropped chars on slow remote-desktop links."
      >
        <div className="space-y-6">
          <NumberInput
            label="Event pause"
            value={settings.eventPauseMs}
            onChange={(v) => set({ eventPauseMs: v })}
            min={5}
            unit="ms"
            suggested={10}
            helper="Floor 7ms (RDP) · 5ms (local). Default 10ms keeps a 30% safety margin."
          />
          <NumberInput
            label="Modifier hold"
            value={settings.modHoldMs}
            onChange={(v) => set({ modHoldMs: v })}
            min={5}
            unit="ms"
            suggested={10}
            helper="Hold time around shifted keys."
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Countdown"
        help="The pre-send window where you can switch focus to the target VM before typing begins. Same delay applies on Resume."
      >
        <NumberInput
          label="Pre-send seconds"
          value={settings.countdownSecs}
          onChange={(v) => set({ countdownSecs: v })}
          min={1}
          unit="s"
          suggested={3}
          helper="Time to refocus the RDP window before typing fires."
        />
      </SettingsSection>
    </div>
  );
}
