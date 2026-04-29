"use client";

import { useEffect, useRef } from "react";

export type CountdownOverlayProps = {
  remaining: number;
  totalSecs: number;
  onCancel: () => void;
};

const RING_RADIUS = 109;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function CountdownOverlay({ remaining, totalSecs, onCancel }: CountdownOverlayProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const elapsed = Math.max(0, totalSecs - remaining);
  const fillFraction = totalSecs > 0 ? elapsed / totalSecs : 1;
  const dashOffset = RING_CIRCUMFERENCE * (1 - fillFraction);
  const display = remaining > 0 ? String(remaining) : "GO";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas/85 backdrop-blur-md"
      role="dialog"
      aria-label="Countdown overlay"
    >
      <div className="relative flex h-[260px] w-[260px] items-center justify-center">
        <svg
          width="260"
          height="260"
          viewBox="0 0 260 260"
          className="-rotate-90"
          role="img"
          aria-label="countdown progress"
        >
          <title>Countdown progress ring</title>
          <circle
            cx="130"
            cy="130"
            r={RING_RADIUS}
            stroke="var(--hairline-strong)"
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="130"
            cy="130"
            r={RING_RADIUS}
            stroke="var(--accent)"
            strokeWidth="3"
            fill="none"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-[140px] font-semibold leading-none text-accent tabular-nums"
          aria-live="polite"
        >
          {display}
        </div>
      </div>
      <p className="mt-8 text-[14px] text-fg-secondary">Click into the RDP window now</p>
      <button
        ref={cancelRef}
        type="button"
        onClick={onCancel}
        className="mt-12 rounded-md border border-hairline-strong bg-elevated px-5 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg"
      >
        Cancel
      </button>
    </div>
  );
}
