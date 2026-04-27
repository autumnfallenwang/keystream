"use client";

import { type RefObject, useState } from "react";
import { FailDiff } from "@/components/fail-diff";
import type { ChunkState } from "@/lib/core/chunks";
import { CHUNK_SIZE_LINES } from "@/lib/core/chunks";
import {
  type ContinueAction,
  type DiffLine,
  type DiffStats,
  log,
  logErr,
  logWarning,
  pickTextFile,
  readTextFile,
} from "@/lib/ipc";

const TOOLBAR =
  "shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 text-xs";
const BUTTON =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs disabled:opacity-50 hover:bg-zinc-100 dark:hover:bg-zinc-800";
const TEXTAREA =
  "flex-1 w-full resize-none bg-transparent font-mono text-sm focus:outline-none px-4 py-2 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500";

const PRE_CONTAINER = "flex-1 w-full overflow-auto py-2 font-mono text-sm";

const CHUNK_BASE = "pl-2";
const CHUNK_STATE: Record<ChunkState, string> = {
  untouched: "border-l-4 border-zinc-300 dark:border-zinc-700",
  inProgress: "border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/30",
  pass: "border-l-4 border-emerald-500",
  fail: "border-l-4 border-red-500",
  stopped: "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
};
const STOPPED_HEADER = "text-xs text-yellow-700 dark:text-yellow-400 mb-1 px-2";
const CHUNK_DIVIDER = "border-t border-zinc-200 dark:border-zinc-800";

const LINE_ROW = "grid grid-cols-[3rem_1fr] gap-x-2";
const LINE_NUM = "text-right text-zinc-400 dark:text-zinc-500 select-none pr-1";
const LINE_CONTENT = "whitespace-pre";
const LINE_CONTENT_OFFENDING = "whitespace-pre bg-red-50 dark:bg-red-950/30";

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}

const swallow = (_err: unknown): void => {
  // Last-resort handler for the logErr promise — if even logging fails,
  // there is nowhere left to surface it.
};

function fireAndForget(label: string, run: () => Promise<void>): () => void {
  return () => {
    run().catch((err) => {
      logErr(`text-panel: ${label} handler crashed: ${String(err)}`).catch(swallow);
    });
  };
}

export type TextPanelProps = {
  text: string;
  locked: boolean;
  onTextChange: (next: string) => void;
  onLock: () => void;
  onUnlock: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  offendingLines: Set<number>;
  chunks: string[][];
  chunkStates: ChunkState[];
  expandedFailChunks: Set<number>;
  onChunkClick: (chunkIndex: number) => void;
  chunkFailDiffs: Map<number, { stats: DiffStats; diff: DiffLine[] }>;
  awaitingAck: number | null;
  onAck: (action: ContinueAction) => void;
};

export function TextPanel({
  text,
  locked,
  onTextChange,
  onLock,
  onUnlock,
  textareaRef,
  offendingLines,
  chunks,
  chunkStates,
  expandedFailChunks,
  onChunkClick,
  chunkFailDiffs,
  awaitingAck,
  onAck,
}: TextPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadFile = async () => {
    setError(null);
    setLoading(true);
    try {
      await log("text-panel: load_file_clicked");
      const picked = await pickTextFile();
      if (picked === null) {
        await log("text-panel: load_cancelled");
        return;
      }
      const contents = await readTextFile(picked.path);
      onTextChange(contents);
      onLock();
      await log(
        `text-panel: file_loaded name=${picked.name} bytes=${contents.length} lines=${lineCount(contents)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      await logWarning(`text-panel: load_failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    onLock();
    await log(`text-panel: submitted chars=${text.length} lines=${lineCount(text)}`);
  };

  const handleEdit = async () => {
    onUnlock();
    setError(null);
    await log(`text-panel: edit_unlocked chars=${text.length}`);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className={TOOLBAR}>
        <div className="text-zinc-500 dark:text-zinc-400">
          {locked ? `Locked · ${text.length} chars · ${lineCount(text)} lines` : "Editable"}
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <button
              type="button"
              className={BUTTON}
              disabled={loading}
              onClick={fireAndForget("load_file", handleLoadFile)}
            >
              {loading ? "Loading…" : "Load File"}
            </button>
          )}
          {!locked && (
            <button
              type="button"
              className={BUTTON}
              disabled={text.length === 0 || loading}
              onClick={fireAndForget("submit", handleSubmit)}
            >
              Submit
            </button>
          )}
          {locked && (
            <button type="button" className={BUTTON} onClick={fireAndForget("edit", handleEdit)}>
              Edit
            </button>
          )}
        </div>
      </div>
      {error !== null && (
        <div className="shrink-0 px-4 py-1 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
      {locked ? (
        <div className={PRE_CONTAINER}>
          {chunks.map((chunkLines, chunkIdx) => {
            const state = chunkStates[chunkIdx] ?? "untouched";
            const isFail = state === "fail";
            const isStopped = state === "stopped";
            const isExpanded = expandedFailChunks.has(chunkIdx);
            const isFirst = chunkIdx === 0;
            const startLineNum = chunkIdx * CHUNK_SIZE_LINES + 1;
            const wrapperClass = [CHUNK_BASE, CHUNK_STATE[state], isFirst ? "" : CHUNK_DIVIDER]
              .filter(Boolean)
              .join(" ");
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: chunk index IS the chunk identity (chunks rebuild atomically on lock/unlock)
              <div key={`chunk-${chunkIdx}`} id={`chunk-${chunkIdx}`} className={wrapperClass}>
                {isStopped && <div className={STOPPED_HEADER}>⏹ chunk {chunkIdx + 1} stopped</div>}
                {isFail && (
                  <button
                    type="button"
                    className="block w-full text-left text-xs text-zinc-500 dark:text-zinc-400 mb-1 px-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => onChunkClick(chunkIdx)}
                  >
                    {isExpanded ? "▾" : "▸"} chunk {chunkIdx + 1} failed
                  </button>
                )}
                <div className={LINE_ROW}>
                  {chunkLines.map((line, lineOffset) => {
                    const lineNum = startLineNum + lineOffset;
                    const isOffending = offendingLines.has(lineNum);
                    return (
                      <Line
                        key={`line-${lineNum}`}
                        lineNum={lineNum}
                        content={line}
                        isOffending={isOffending}
                      />
                    );
                  })}
                </div>
                {isFail &&
                  isExpanded &&
                  (() => {
                    const payload = chunkFailDiffs.get(chunkIdx);
                    if (payload === undefined) {
                      return (
                        <div className="px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 italic">
                          diff payload unavailable
                        </div>
                      );
                    }
                    return (
                      <FailDiff
                        diff={payload.diff}
                        stats={payload.stats}
                        awaitingAck={awaitingAck === chunkIdx}
                        onAck={onAck}
                      />
                    );
                  })()}
              </div>
            );
          })}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className={TEXTAREA}
          placeholder="Paste text or click Load File"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          spellCheck={false}
        />
      )}
    </div>
  );
}

function Line({
  lineNum,
  content,
  isOffending,
}: {
  lineNum: number;
  content: string;
  isOffending: boolean;
}) {
  // grid-cols renders the row as two cells; using two children keeps a11y
  // tooling happy and matches the LINE_ROW grid above.
  return (
    <>
      <span className={LINE_NUM}>{lineNum}</span>
      <span className={isOffending ? LINE_CONTENT_OFFENDING : LINE_CONTENT}>{content || " "}</span>
    </>
  );
}
