// Pure send-progress text computation. Drives the bottom controls' status
// label during a chunked send (task 39).

import type { ChunkState } from "./chunks";

export type SendCompletePayload = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type ProgressInputs = {
  chunkStates: ChunkState[];
  sending: boolean;
  sendSummary: SendCompletePayload | null;
  /** 0-indexed chunk where stop landed; rendered 1-indexed for the user. */
  sendCancelledAt: number | null;
  fallback: string; // idle text — gate-derived "Waiting on N gate(s)" / "Ready to send"
};

export function computeProgressText({
  chunkStates,
  sending,
  sendSummary,
  sendCancelledAt,
  fallback,
}: ProgressInputs): string {
  if (sendCancelledAt !== null) {
    const total = chunkStates.length;
    return `Stopped at chunk ${sendCancelledAt + 1} / ${total}`;
  }
  if (sendSummary !== null) {
    return `Done · ${sendSummary.passed}/${sendSummary.total} passed`;
  }
  if (sending) {
    const total = chunkStates.length;
    const completed = chunkStates.filter((s) => s === "pass" || s === "fail").length;
    const inProgressIdx = chunkStates.indexOf("inProgress");
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (inProgressIdx >= 0) {
      return `Chunk ${inProgressIdx + 1} / ${total} · ${pct}% done`;
    }
    return `${completed} / ${total} · ${pct}% done`;
  }
  return fallback;
}
