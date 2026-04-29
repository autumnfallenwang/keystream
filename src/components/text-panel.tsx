"use client";

import { Upload } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { activeLineIndex } from "@/lib/core/active-line";
import type { AppState } from "@/lib/core/app-state";

export type TextPanelProps = {
  text: string;
  locked: boolean;
  state: AppState;
  onTextChange: (next: string) => void;
  onLoadFile: () => void;
};

// Q16: gutter row line-height MUST equal content row line-height. Content
// renders at `text-[13px] leading-[1.6]` → 13 × 1.6 = 20.8px per row. Gutter
// line numbers stay smaller (`text-[11px]`) for visual subordination but
// each gutter row is sized to LINE_HEIGHT_PX so the columns align at every
// row regardless of UI scale (--font-scale from Q15).
const LINE_HEIGHT_PX = 20.8;

export function TextPanel(props: TextPanelProps) {
  if (!props.locked) {
    return <EditView {...props} />;
  }
  return <LockedView {...props} />;
}

function EditView(props: TextPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.text.length === 0) return;
    textareaRef.current?.focus();
  }, [props.text.length]);

  const lineCount = useMemo(() => {
    if (props.text.length === 0) return 0;
    return props.text.split("\n").length;
  }, [props.text]);

  if (props.text.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-fg-tertiary">Drop a file here, or click to load</p>
        <button
          type="button"
          onClick={props.onLoadFile}
          className="flex items-center gap-2 rounded-md border border-hairline-strong bg-elevated px-4 py-2 font-mono text-[12px] text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg"
        >
          <Upload size={14} />
          <span>
            <span className="text-fg-tertiary">⌘O</span> Load file
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-canvas">
      <Gutter
        lineCount={lineCount}
        activeNumber={null}
        ref={gutterRef}
        topPaddingPx={12}
        bottomPaddingPx={12}
      />
      <textarea
        ref={textareaRef}
        value={props.text}
        onChange={(e) => props.onTextChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current !== null) {
            gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }
        }}
        spellCheck={false}
        wrap="off"
        style={{ whiteSpace: "pre", lineHeight: `${LINE_HEIGHT_PX}px` }}
        className="flex-1 resize-none overflow-auto bg-canvas px-4 py-3 font-code text-[13px] text-fg outline-none"
      />
    </div>
  );
}

type RenderedLine = { number: number; content: string };

function LockedView(props: TextPanelProps) {
  const lines: RenderedLine[] = useMemo(() => {
    const split = props.text.split("\n");
    return split.map((content, i) => ({ number: i + 1, content }));
  }, [props.text]);

  const charsTyped = sendingCharsTyped(props.state);
  const isActiveSend = props.state.mode === "sending" || props.state.mode === "paused";
  const activeIdx = isActiveSend ? activeLineIndex(props.text, charsTyped) : -1;
  const activeNumber = activeIdx >= 0 ? activeIdx + 1 : null;
  const isPaused = props.state.mode === "paused";

  return (
    <div className="flex flex-1 overflow-auto bg-canvas">
      <div className="flex flex-1">
        <Gutter lineCount={lines.length} activeNumber={activeNumber} sticky />

        <pre
          className="flex-1 px-4 font-code text-[13px] text-fg"
          style={{ lineHeight: `${LINE_HEIGHT_PX}px` }}
        >
          {lines.map((l) => (
            <LineRow
              key={l.number}
              content={l.content}
              isActive={l.number === activeNumber}
              isPaused={isPaused}
            />
          ))}
        </pre>
      </div>
    </div>
  );
}

type GutterProps = {
  lineCount: number;
  activeNumber: number | null;
  sticky?: boolean;
  topPaddingPx?: number;
  bottomPaddingPx?: number;
  ref?: React.Ref<HTMLDivElement>;
};

function Gutter({
  lineCount,
  activeNumber,
  sticky,
  topPaddingPx = 0,
  bottomPaddingPx = 0,
  ref,
}: GutterProps) {
  const className = `${sticky ? "sticky left-0 " : ""}w-[52px] shrink-0 overflow-hidden border-r border-hairline-soft bg-rail font-code text-[11px]`;
  return (
    <div
      ref={ref}
      className={className}
      style={{ paddingTop: topPaddingPx, paddingBottom: bottomPaddingPx }}
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => {
        const isActive = activeNumber !== null && n === activeNumber;
        return (
          <div
            key={n}
            className={`pr-3 text-right ${
              isActive ? "font-medium text-fg-secondary" : "text-fg-tertiary"
            }`}
            style={{ lineHeight: `${LINE_HEIGHT_PX}px`, height: `${LINE_HEIGHT_PX}px` }}
          >
            {isActive ? "→ " : ""}
            {n}
          </div>
        );
      })}
    </div>
  );
}

function LineRow({
  content,
  isActive,
  isPaused,
}: {
  content: string;
  isActive: boolean;
  isPaused: boolean;
}) {
  const baseStyle = "relative block whitespace-pre";
  if (!isActive) {
    return <span className={baseStyle}>{content || " "}</span>;
  }
  return (
    <span
      className={`${baseStyle} -mx-4 border-l-2 border-accent bg-accent-glow px-4`}
      data-testid="active-line"
    >
      {content || " "}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-[1px] bg-accent"
        style={{
          animation: "scanline 800ms linear infinite",
          animationPlayState: isPaused ? "paused" : "running",
        }}
        data-testid="scanline"
        data-paused={isPaused ? "true" : "false"}
      />
    </span>
  );
}

function sendingCharsTyped(state: AppState): number {
  if (state.mode === "sending") return state.charsTyped;
  if (state.mode === "paused") return state.charsTyped;
  return 0;
}
