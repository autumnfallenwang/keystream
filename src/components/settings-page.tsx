"use client";

import { ChevronLeft } from "lucide-react";
import type { Settings } from "@/lib/ipc";

export type SettingsPageProps = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  onBack: () => void;
};

export function SettingsPage(props: SettingsPageProps) {
  const set = (patch: Partial<Settings>) => props.onChange({ ...props.settings, ...patch });
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline bg-canvas px-[18px]">
        <button
          type="button"
          onClick={props.onBack}
          className="flex items-center gap-1 text-[13px] text-fg-secondary transition-colors hover:text-fg"
        >
          <ChevronLeft size={16} />
          <span>Back to text</span>
        </button>
        <span className="text-[13px] text-fg-secondary">Settings</span>
      </header>

      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto max-w-[480px] space-y-8">
          <Section title="Timing">
            <Slider
              label="Event pause"
              value={props.settings.eventPauseMs}
              onChange={(v) => set({ eventPauseMs: v })}
              min={5}
              max={20}
              unit="ms"
              helper="Floor 7ms (AVD) · 5ms (local). Default 10ms keeps a 30% safety margin."
            />
            <Slider
              label="Modifier hold"
              value={props.settings.modHoldMs}
              onChange={(v) => set({ modHoldMs: v })}
              min={5}
              max={20}
              unit="ms"
              helper="Hold time around shifted keys. Default 10ms."
            />
          </Section>

          <Section title="Countdown">
            <Slider
              label="Pre-send seconds"
              value={props.settings.countdownSecs}
              onChange={(v) => set({ countdownSecs: v })}
              min={1}
              max={10}
              unit="s"
              helper="Time to refocus the AVD window before typing fires."
            />
          </Section>

          <Section title="Advanced">
            <Checkbox
              label="Shift warmup"
              checked={props.settings.warmupShift}
              onChange={(v) => set({ warmupShift: v })}
              helper="Sends a dummy shift press during countdown to stabilize modifier state. Recommended on."
            />
          </Section>

          <div className="border-t border-hairline pt-6">
            <button
              type="button"
              onClick={props.onReset}
              className="rounded-md border border-hairline-strong bg-elevated px-4 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary">
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  helper,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  unit: string;
  helper?: string;
}) {
  const id = `slider-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] text-fg-secondary">
          {label}
        </label>
        <span className="font-code text-[12px] tabular-nums text-fg">
          {value} {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full accent-accent"
      />
      {helper !== undefined && <p className="mt-1.5 text-[11px] text-fg-tertiary">{helper}</p>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  helper?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-4 w-4 accent-accent"
      />
      <div>
        <p className="text-[13px] text-fg-secondary">{label}</p>
        {helper !== undefined && <p className="mt-1 text-[11px] text-fg-tertiary">{helper}</p>}
      </div>
    </label>
  );
}
