"use client";

import { Pause, Play, Square } from "lucide-react";
import type { AppState } from "@/lib/core/app-state";
import { computeStatusText } from "@/lib/core/progress";

export type ActionBarProps = {
  state: AppState;
  canSend: boolean;
  totalChars: number;
  onSend: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function ActionBar(props: ActionBarProps) {
  const status = computeStatusText({ state: props.state, totalChars: props.totalChars });
  const primary = pickPrimary(props);
  const stopEnabled = props.state.mode === "sending" || props.state.mode === "paused";

  return (
    <footer className="sticky bottom-0 shrink-0 border-t border-hairline-strong bg-elevated">
      {status !== null && (
        <div className="flex h-7 items-center justify-center px-[18px] font-mono text-[12px] tabular-nums text-fg-secondary">
          {status}
        </div>
      )}
      <div className="flex h-[64px] items-center justify-center gap-4">
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className={primary.className}
          aria-label={primary.label}
        >
          {primary.icon}
          <span>{primary.label}</span>
        </button>
        <button
          type="button"
          onClick={props.onStop}
          disabled={!stopEnabled}
          className={
            stopEnabled
              ? "flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-md border border-alert bg-elevated px-5 text-[14px] font-medium text-alert transition-colors hover:bg-bg-hover"
              : "flex h-11 min-w-[120px] cursor-not-allowed items-center justify-center gap-2 rounded-md border border-hairline-strong bg-elevated px-5 text-[14px] font-medium text-fg-quaternary"
          }
          aria-label="Stop"
        >
          <Square size={14} />
          <span>Stop</span>
        </button>
      </div>
    </footer>
  );
}

type PrimaryAction = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  className: string;
};

function pickPrimary(props: ActionBarProps): PrimaryAction {
  const accentBtn =
    "flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-md bg-accent px-5 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-press";
  const warnBtn =
    "flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-md bg-warn px-5 text-[14px] font-medium text-bg-canvas transition-colors hover:opacity-90";
  const disabledBtn =
    "flex h-11 min-w-[140px] cursor-not-allowed items-center justify-center gap-2 rounded-md bg-bg-active px-5 text-[14px] font-medium text-fg-quaternary";

  switch (props.state.mode) {
    case "sending":
      return {
        icon: <Pause size={14} />,
        label: "Pause",
        onClick: props.onPause,
        disabled: false,
        className: warnBtn,
      };
    case "paused":
      return {
        icon: <Play size={14} />,
        label: "Resume",
        onClick: props.onResume,
        disabled: false,
        className: accentBtn,
      };
    default:
      return {
        icon: <Play size={14} />,
        label: "Send",
        onClick: props.onSend,
        disabled: !props.canSend,
        className: props.canSend ? accentBtn : disabledBtn,
      };
  }
}
