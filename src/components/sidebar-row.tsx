"use client";

// Shared row + eyebrow primitives for both the main `<Sidebar>` and the
// settings-mode `<SettingsSidebar>`. Pulled out so both rails share the
// same h-9 / px-[14px] / 3px active-edge geometry.

export function SidebarEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-5 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-fg-tertiary"
      data-testid="eyebrow"
    >
      {children}
    </p>
  );
}

export type SidebarRowProps = {
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export function SidebarRow({ icon, active, disabled, onClick, children }: SidebarRowProps) {
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
