"use client";

// Q21 — Consolidated main header. Single home for per-file actions:
// filename (left) · Edit/Lock · Wrap · Send/Pause/Resume · Stop (right).
//
// Status-during-send sits as a thin sub-row underneath; the old footer
// action bar is retired. See design-plan.md Q21.

import { Pause, Play, Square, WrapText } from "lucide-react";
import type { AppState } from "@/lib/core/app-state";
import { computeStatusText } from "@/lib/core/progress";

export type MainHeaderProps = {
  state: AppState;
  /** Loaded file's basename, or null when no file is loaded. */
  filename: string | null;
  locked: boolean;
  totalChars: number;
  wrap: boolean;
  /** Reason the Send button is disabled, surfaced in its `title` (hover
   * tooltip) when `canSend` is false. e.g. "Lock the text to send" or
   * "Grant Accessibility in System Settings". */
  sendDisabledReason: string | null;
  canSend: boolean;
  onToggleLocked: (next: boolean) => void;
  onToggleWrap: () => void;
  onSend: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function MainHeader(props: MainHeaderProps) {
  const status = computeStatusText({ state: props.state, totalChars: props.totalChars });
  const editLockDisabled =
    props.state.mode === "sending" ||
    props.state.mode === "paused" ||
    props.state.mode === "countdown";
  const stopEnabled = props.state.mode === "sending" || props.state.mode === "paused";
  const primary = pickPrimary(props);

  return (
    <div className="shrink-0 border-b border-hairline bg-canvas">
      <header className="flex h-[60px] items-center gap-4 px-[18px]">
        <FilenameSlot filename={props.filename} />

        <div className="flex shrink-0 items-center gap-2">
          <EditLockSwitch
            locked={props.locked}
            disabled={editLockDisabled}
            onToggle={props.onToggleLocked}
          />
          <WrapToggle wrap={props.wrap} onToggle={props.onToggleWrap} />
          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className={primary.className}
            title={primary.title ?? undefined}
            aria-label={primary.label}
          >
            {primary.icon}
            <span>{primary.label}</span>
          </button>
          <button
            type="button"
            onClick={props.onStop}
            disabled={!stopEnabled}
            className={stopEnabled ? STOP_BTN_ENABLED : STOP_BTN_DISABLED}
            aria-label="Stop"
          >
            <Square size={13} />
            <span>Stop</span>
          </button>
        </div>
      </header>

      {status !== null && (
        <div
          className="flex h-6 items-center justify-center border-t border-hairline-soft px-[18px] font-mono text-[11px] tabular-nums text-fg-tertiary"
          data-testid="header-status-line"
        >
          {status}
        </div>
      )}
    </div>
  );
}

function FilenameSlot({ filename }: { filename: string | null }) {
  if (filename === null) {
    return (
      <span
        className="min-w-0 flex-1 truncate text-[13px] italic text-fg-tertiary"
        data-testid="filename-slot"
      >
        Untitled
      </span>
    );
  }
  return (
    <span
      className="min-w-0 flex-1 truncate font-code text-[13px] text-fg"
      data-testid="filename-slot"
      title={filename}
    >
      {filename}
    </span>
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

function WrapToggle({ wrap, onToggle }: { wrap: boolean; onToggle: () => void }) {
  const classes = wrap
    ? "flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-bg-active text-fg transition-colors hover:bg-bg-hover"
    : "flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-elevated text-fg-tertiary transition-colors hover:bg-bg-hover hover:text-fg-secondary";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={classes}
      title={wrap ? "Wrap: on (click to disable)" : "Wrap: off (click to enable soft-wrap)"}
      aria-label="Toggle wrap"
      aria-pressed={wrap}
      data-testid="wrap-toggle"
    >
      <WrapText size={14} />
    </button>
  );
}

type PrimaryAction = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  className: string;
  title: string | null;
};

const PRIMARY_BTN_ACCENT =
  "flex h-8 min-w-[100px] items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-press";
const PRIMARY_BTN_WARN =
  "flex h-8 min-w-[100px] items-center justify-center gap-2 rounded-md bg-warn px-4 text-[13px] font-medium text-bg-canvas transition-colors hover:opacity-90";
const PRIMARY_BTN_DISABLED =
  "flex h-8 min-w-[100px] cursor-not-allowed items-center justify-center gap-2 rounded-md bg-bg-active px-4 text-[13px] font-medium text-fg-quaternary";

const STOP_BTN_ENABLED =
  "flex h-8 items-center gap-2 rounded-md border border-alert bg-elevated px-3 text-[13px] font-medium text-alert transition-colors hover:bg-bg-hover";
const STOP_BTN_DISABLED =
  "flex h-8 cursor-not-allowed items-center gap-2 rounded-md border border-hairline bg-elevated px-3 text-[13px] font-medium text-fg-quaternary";

function pickPrimary(props: MainHeaderProps): PrimaryAction {
  switch (props.state.mode) {
    case "sending":
      return {
        icon: <Pause size={13} />,
        label: "Pause",
        onClick: props.onPause,
        disabled: false,
        className: PRIMARY_BTN_WARN,
        title: null,
      };
    case "paused":
      return {
        icon: <Play size={13} />,
        label: "Resume",
        onClick: props.onResume,
        disabled: false,
        className: PRIMARY_BTN_ACCENT,
        title: null,
      };
    default:
      return {
        icon: <Play size={13} />,
        label: "Send",
        onClick: props.onSend,
        disabled: !props.canSend,
        className: props.canSend ? PRIMARY_BTN_ACCENT : PRIMARY_BTN_DISABLED,
        title: props.canSend ? null : props.sendDisabledReason,
      };
  }
}
