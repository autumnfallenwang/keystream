"use client";

import { useEffect, useRef } from "react";

/** Mirrors `typer_core::config::COUNTDOWN_SECS`. */
export const COUNTDOWN_SECS = 3;

export type CountdownState = {
  /** Seconds remaining: 3, 2, 1, then 0 ("GO"). */
  remaining: number;
};

export type CountdownOverlayProps = {
  state: CountdownState | null;
  onCancel: () => void;
};

export function CountdownOverlay({ state, onCancel }: CountdownOverlayProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Auto-focus Cancel on mount so Esc reaches the page-level keydown
  // listener even on browsers that gate keyboard input behind focus.
  useEffect(() => {
    if (state !== null) {
      cancelRef.current?.focus();
    }
  }, [state]);

  if (state === null) return null;

  const display = state.remaining > 0 ? String(state.remaining) : "GO";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-white">
      <div className="text-9xl font-bold tabular-nums" aria-live="polite">
        {display}
      </div>
      <p className="mt-6 text-xl">Click into the target window now</p>
      <button
        ref={cancelRef}
        type="button"
        className="mt-12 rounded-md bg-white/10 hover:bg-white/20 px-6 py-3 text-base"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
