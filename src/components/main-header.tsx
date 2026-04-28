"use client";

import type { AppState } from "@/lib/core/app-state";
import { computeStatusText } from "@/lib/core/progress";

export type MainHeaderProps = {
  state: AppState;
  textLoaded: boolean;
  textCharCount: number;
  accessibilityGranted: boolean;
  locked: boolean;
  totalChars: number;
  onTextGateClick: () => void;
  onAccessibilityGateClick: () => void;
  onToggleLocked: (next: boolean) => void;
};

export function MainHeader(props: MainHeaderProps) {
  const status = computeStatusText({ state: props.state, totalChars: props.totalChars });
  const isStatusMode = status !== null;
  const editLockDisabled =
    props.state.mode === "sending" ||
    props.state.mode === "paused" ||
    props.state.mode === "countdown";

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline bg-canvas px-[18px]">
      <div className="flex min-w-0 items-center gap-6">
        {isStatusMode ? (
          <span className="font-mono text-[12px] tabular-nums text-fg-secondary">{status}</span>
        ) : (
          <>
            <Gate
              ok={props.textLoaded}
              label={textGateLabel(props.textLoaded, props.textCharCount, props.locked)}
              onClick={props.onTextGateClick}
            />
            <Gate
              ok={props.accessibilityGranted}
              label="Accessibility"
              onClick={props.onAccessibilityGateClick}
            />
          </>
        )}
      </div>

      <EditLockSwitch
        locked={props.locked}
        disabled={editLockDisabled}
        onToggle={props.onToggleLocked}
      />
    </header>
  );
}

function textGateLabel(textLoaded: boolean, charCount: number, locked: boolean): string {
  if (textLoaded) {
    return `Text loaded · ${charCount.toLocaleString("en-US")} chars`;
  }
  if (locked) {
    return "No text loaded";
  }
  return "Lock to send";
}

function Gate({ ok, label, onClick }: { ok: boolean; label: string; onClick: () => void }) {
  const mark = ok ? "✓" : "✗";
  const markColor = ok ? "text-ok" : "text-alert";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[6px] rounded-md text-[13px] text-fg-secondary transition-colors hover:text-fg"
    >
      <span className={`font-mono text-[11px] font-medium ${markColor}`}>{mark}</span>
      <span>{label}</span>
    </button>
  );
}

function EditLockSwitch({
  locked,
  disabled,
  onToggle,
}: {
  locked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <fieldset
      className={`relative m-0 flex h-7 select-none items-center rounded-md border border-hairline bg-elevated p-[2px] text-[12px] ${
        disabled ? "opacity-50" : ""
      }`}
      aria-label="Edit / Lock toggle"
    >
      <Segment active={!locked} disabled={disabled} onClick={() => onToggle(false)}>
        Edit
      </Segment>
      <Segment active={locked} disabled={disabled} onClick={() => onToggle(true)}>
        Lock
      </Segment>
    </fieldset>
  );
}

function Segment({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const classes = active ? "bg-bg-active text-fg" : "text-fg-tertiary hover:text-fg-secondary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[5px] px-3 py-[3px] transition-colors ${classes} ${
        disabled ? "cursor-not-allowed" : ""
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
