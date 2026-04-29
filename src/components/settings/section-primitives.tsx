"use client";

// Q17: Settings sections render through a single shared SettingsSection
// primitive — title row (14px h2 medium) + optional `?` info icon
// (lucide Info, native title-attribute tooltip) + card-wrapped content
// (rounded, 1px hairline border, --bg-elevated, soft shadow, 16px
// padding). Borrowed from teacherease-parent-companion's settings
// pattern but using our chrome tokens. `card={false}` opts out for
// children that already render their own shell.

import { Info } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export type SettingsSectionProps = {
  title: string;
  help?: string;
  children: ReactNode;
  card?: boolean;
};

export function SettingsSection({ title, help, children, card = true }: SettingsSectionProps) {
  const shell = card
    ? "rounded-md border border-hairline bg-elevated p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    : "";
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <h2 className="text-[14px] font-medium text-fg">{title}</h2>
        {help !== undefined && (
          <span
            role="img"
            aria-label={`${title} help: ${help}`}
            title={help}
            className="cursor-help text-fg-tertiary transition-colors hover:text-fg-secondary"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className={shell}>{children}</div>
    </section>
  );
}

export type NumberInputProps = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  /** Inclusive floor. Values below this are clamped on commit. */
  min: number;
  /** Inclusive ceiling. Optional — pass undefined for an open-ended range. */
  max?: number;
  unit: string;
  /** Suggested ("recommended") value, surfaced as inline guidance. */
  suggested?: number;
  helper?: string;
};

/** Bounded integer input. Commits on Enter or blur:
 *  - Empty / non-numeric → revert to current saved value (no save)
 *  - Below `min` → clamp up to `min` and save
 *  - Above `max` (if defined) → clamp down to `max` and save
 *  - Otherwise → save as-typed (rounded to integer)
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  suggested,
  helper,
}: NumberInputProps) {
  const id = `num-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const [draft, setDraft] = useState<string>(String(value));

  // Re-sync draft whenever the saved value changes (e.g. global Reset).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = Math.round(parsed);
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    if (next !== value) onChange(next);
    setDraft(String(next));
  };

  // Range hint string: shows the floor and (if defined) ceiling, plus the
  // suggested default. Composes flexibly: "min 5 · suggested 10" or
  // "5–20 · suggested 10".
  const rangeHint = (() => {
    const parts: string[] = [];
    if (max === undefined) parts.push(`min ${min}`);
    else parts.push(`${min}–${max}`);
    if (suggested !== undefined) parts.push(`suggested ${suggested}`);
    return parts.join(" · ");
  })();

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] text-fg-secondary">
          {label}
        </label>
        <span className="font-code text-[11px] tabular-nums text-fg-tertiary">{rangeHint}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="h-8 w-24 rounded-md border border-hairline bg-canvas px-2 font-code text-[13px] tabular-nums text-fg outline-none focus:border-accent"
        />
        <span className="font-code text-[12px] tabular-nums text-fg-tertiary">{unit}</span>
      </div>
      {helper !== undefined && <p className="mt-1.5 text-[11px] text-fg-tertiary">{helper}</p>}
    </div>
  );
}

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  helper?: string;
};

export function Checkbox({ label, checked, onChange, helper }: CheckboxProps) {
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
