"use client";

import { type CharSpan, charDiffSpans } from "@/lib/core/diff-render";
import type { ContinueAction, DiffLine, DiffStats } from "@/lib/ipc";

const ROW_BASE = "mt-1 px-2 py-1 border-l-2 text-xs font-mono";
const ROW_MISMATCH = `${ROW_BASE} border-amber-400 bg-amber-50/30 dark:bg-amber-950/20`;
const ROW_DROP = `${ROW_BASE} border-zinc-400 bg-zinc-100/50 dark:bg-zinc-800/40`;
const ROW_EXTRA = `${ROW_BASE} border-blue-400 bg-blue-50/40 dark:bg-blue-950/20`;

const SIDE_LABEL = "inline-block w-12 text-zinc-400 select-none mr-2";
const KIND_LABEL = "text-zinc-500 dark:text-zinc-400 mr-2";

const SPAN_DIFF = "bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-100 rounded-sm";
const SPAN_EXTRA =
  "bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 rounded-sm";

const BTN_BASE = "rounded-md px-3 py-1 text-xs";
const BTN_SKIP = `${BTN_BASE} border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800`;
const BTN_STOP = `${BTN_BASE} border border-zinc-200 dark:border-zinc-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`;
const BTN_CONTINUE = `${BTN_BASE} bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200`;

export type FailDiffProps = {
  diff: DiffLine[];
  stats: DiffStats;
  awaitingAck: boolean;
  onAck: (action: ContinueAction) => void;
};

function spanClass(kind: CharSpan["kind"]): string | undefined {
  if (kind === "diff") return SPAN_DIFF;
  if (kind === "extra") return SPAN_EXTRA;
  return undefined;
}

function renderSpans(spans: CharSpan[]): React.ReactNode {
  return spans.map((s, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional and rebuild on every render of the row
    <span key={`s-${i}`} className={spanClass(s.kind)}>
      {s.text || " "}
    </span>
  ));
}

function MismatchRow({ sent, seen }: { sent: string; seen: string }) {
  const { sent: sentSpans, seen: seenSpans } = charDiffSpans(sent, seen);
  return (
    <div className={ROW_MISMATCH}>
      <div>
        <span className={SIDE_LABEL}>sent</span>
        {renderSpans(sentSpans)}
      </div>
      <div>
        <span className={SIDE_LABEL}>seen</span>
        {renderSpans(seenSpans)}
      </div>
    </div>
  );
}

function DropRow({ sent }: { sent: string }) {
  return (
    <div className={ROW_DROP}>
      <span className={KIND_LABEL}>OCR drop</span>
      <span className={SIDE_LABEL}>sent</span>
      <span className="whitespace-pre">{sent || " "}</span>
    </div>
  );
}

function ExtraRow({ seen }: { seen: string }) {
  return (
    <div className={ROW_EXTRA}>
      <span className={KIND_LABEL}>OCR extra</span>
      <span className={SIDE_LABEL}>seen</span>
      <span className="whitespace-pre">{seen || " "}</span>
    </div>
  );
}

const CONTINUE_TOOLTIP =
  "Re-checks the AVD via OCR. Backend does NOT re-type. Use this after manually fixing the chunk in the AVD.";

export function FailDiff({ diff, stats, awaitingAck, onAck }: FailDiffProps) {
  return (
    <div className="px-2 pb-2">
      <div className="mt-2 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400">
        aligned={stats.alignedLines} matching={stats.matchingLines} drops={stats.dropped} extras=
        {stats.extra} char_diffs={stats.charDiffs}
      </div>
      {diff
        .filter((d) => d.kind !== "Match")
        .map((d) => {
          if (d.kind === "Mismatch") {
            return <MismatchRow key={`m-${d.index}`} sent={d.sent ?? ""} seen={d.seen ?? ""} />;
          }
          if (d.kind === "OcrDrop") {
            return <DropRow key={`d-${d.index}`} sent={d.sent ?? ""} />;
          }
          if (d.kind === "OcrExtra") {
            return <ExtraRow key={`x-${d.index}`} seen={d.seen ?? ""} />;
          }
          return null;
        })}
      {awaitingAck && (
        <div className="mt-3 flex gap-2 px-2">
          <button type="button" className={BTN_SKIP} onClick={() => onAck("skip")}>
            Skip
          </button>
          <button type="button" className={BTN_STOP} onClick={() => onAck("stop")}>
            Stop
          </button>
          <button
            type="button"
            className={BTN_CONTINUE}
            title={CONTINUE_TOOLTIP}
            onClick={() => onAck("retry")}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
