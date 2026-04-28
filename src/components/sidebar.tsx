"use client";

import { FileText, Settings, Trash2, Upload } from "lucide-react";

export type SidebarProps = {
  onLoadFile: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  onOpenSettings: () => void;
  inSettings: boolean;
  appVersion: string;
};

export function Sidebar({
  onLoadFile,
  onClear,
  clearDisabled,
  onOpenSettings,
  inSettings,
  appVersion,
}: SidebarProps) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-hairline bg-rail">
      <div className="px-5 pb-4 pt-7">
        <h1 className="font-display text-[18px] font-medium tracking-tight text-fg">Keystream</h1>
      </div>

      <Eyebrow>Document</Eyebrow>
      <RailButton icon={<FileText size={16} />} active={!inSettings} onClick={selectCurrent}>
        Current text
      </RailButton>
      <RailButton icon={<Upload size={16} />} onClick={onLoadFile}>
        Load file…
      </RailButton>
      <RailButton icon={<Trash2 size={16} />} disabled={clearDisabled} onClick={onClear}>
        Clear
      </RailButton>

      <div className="mt-5">
        <Eyebrow>History</Eyebrow>
        <p className="px-5 py-1 text-[12px] italic text-fg-tertiary">
          Sent texts will appear here.
        </p>
      </div>

      <div className="flex-1" />

      <div className="border-t border-hairline-soft py-1">
        <RailButton icon={<Settings size={16} />} active={inSettings} onClick={onOpenSettings}>
          Settings
        </RailButton>
        <p className="px-5 pb-3 pt-1 font-mono text-[10px] tracking-wide text-fg-quaternary">
          v{appVersion}
        </p>
      </div>
    </aside>
  );
}

// "Current text" rail item is selected implicitly when not in settings.
// Future history feature will replace this with real click semantics
// (selecting a saved snippet to load into the panel).
function selectCurrent(): void {
  return;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-5 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary"
      data-testid="eyebrow"
    >
      {children}
    </p>
  );
}

type RailButtonProps = {
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function RailButton({ icon, active, disabled, onClick, children }: RailButtonProps) {
  const base =
    "relative flex h-9 w-full items-center gap-[10px] px-[14px] text-[13px] transition-colors";
  let classes: string;
  if (disabled) {
    classes = `${base} text-fg-quaternary cursor-not-allowed`;
  } else if (active) {
    classes = `${base} bg-bg-active text-fg`;
  } else {
    classes = `${base} text-fg-secondary hover:bg-bg-hover`;
  }
  return (
    <button type="button" className={classes} disabled={disabled} onClick={onClick}>
      {active && (
        <span
          className="absolute left-0 top-0 h-full w-[3px] bg-accent"
          aria-hidden
          data-testid="active-edge"
        />
      )}
      <span className="text-fg-tertiary">{icon}</span>
      <span>{children}</span>
    </button>
  );
}
