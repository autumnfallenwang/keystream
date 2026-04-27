// Pure reducer for the chunked-send state machine (task 46).
// Mirrors the inline handleSendEvent logic from page.tsx so it can be
// tested in isolation. Mutation-safe: every update returns new arrays /
// maps / sets so React's setState picks up the change.

import type { DiffLine, DiffStats, SendEvent } from "@/lib/ipc";
import { applySendCancelled, type ChunkState } from "./chunks";
import type { SendCompletePayload } from "./progress";

export type ChunkFailPayload = { stats: DiffStats; diff: DiffLine[] };

export type DispatchState = {
  chunkStates: ChunkState[];
  chunkFailDiffs: Map<number, ChunkFailPayload>;
  awaitingAck: number | null;
  sendSummary: SendCompletePayload | null;
  sendCancelledAt: number | null;
  sending: boolean;
  expandedFailChunks: Set<number>;
};

export function initialDispatchState(chunkCount: number): DispatchState {
  return {
    chunkStates: Array.from<ChunkState>({ length: chunkCount }).fill("untouched"),
    chunkFailDiffs: new Map(),
    awaitingAck: null,
    sendSummary: null,
    sendCancelledAt: null,
    sending: false,
    expandedFailChunks: new Set(),
  };
}

function setIndex<T>(arr: T[], index: number, value: T): T[] {
  const next = [...arr];
  if (index >= 0 && index < next.length) next[index] = value;
  return next;
}

function dispatchChunkStart(state: DispatchState, index: number, total: number): DispatchState {
  let chunkStates: ChunkState[];
  if (state.chunkStates.length === total) {
    chunkStates = setIndex(state.chunkStates, index, "inProgress");
  } else {
    // Defensive: backend's total disagrees with frontend's chunkText.
    chunkStates = Array.from<ChunkState>({ length: total }).fill("untouched");
    if (index >= 0 && index < chunkStates.length) chunkStates[index] = "inProgress";
  }
  return {
    ...state,
    chunkStates,
    awaitingAck: null,
    sending: true,
  };
}

function dispatchChunkPass(state: DispatchState, index: number): DispatchState {
  return {
    ...state,
    chunkStates: setIndex(state.chunkStates, index, "pass"),
    awaitingAck: null,
  };
}

function dispatchChunkFail(
  state: DispatchState,
  index: number,
  stats: DiffStats,
  diff: DiffLine[],
): DispatchState {
  const chunkFailDiffs = new Map(state.chunkFailDiffs);
  chunkFailDiffs.set(index, { stats, diff });
  const expandedFailChunks = state.expandedFailChunks.has(index)
    ? state.expandedFailChunks
    : new Set([...state.expandedFailChunks, index]);
  return {
    ...state,
    chunkStates: setIndex(state.chunkStates, index, "fail"),
    chunkFailDiffs,
    expandedFailChunks,
    awaitingAck: index,
  };
}

function dispatchSendComplete(state: DispatchState, summary: SendCompletePayload): DispatchState {
  return {
    ...state,
    sendSummary: summary,
    sending: false,
    awaitingAck: null,
  };
}

function dispatchSendCancelled(state: DispatchState, atChunk: number): DispatchState {
  const { next, stoppedIdx } = applySendCancelled(state.chunkStates, atChunk);
  return {
    ...state,
    chunkStates: next,
    sendCancelledAt: stoppedIdx,
    sending: false,
    awaitingAck: null,
  };
}

export function dispatchSendEvent(state: DispatchState, event: SendEvent): DispatchState {
  switch (event.event) {
    case "chunkStart":
      return dispatchChunkStart(state, event.data.index, event.data.total);
    case "chunkPass":
      return dispatchChunkPass(state, event.data.index);
    case "chunkFail":
      return dispatchChunkFail(state, event.data.index, event.data.stats, event.data.diff);
    case "sendComplete":
      return dispatchSendComplete(state, event.data);
    case "sendCancelled":
      return dispatchSendCancelled(state, event.data.atChunk);
  }
}
