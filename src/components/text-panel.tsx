"use client";

import { Upload } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { activeLineIndex } from "@/lib/core/active-line";
import type { AppState } from "@/lib/core/app-state";

export type TextPanelProps = {
  text: string;
  locked: boolean;
  state: AppState;
  /** Q21 — when true, soft-wrap long lines. Default off (Q16's
   * `white-space: pre`). */
  wrap: boolean;
  onTextChange: (next: string) => void;
  onLoadFile: () => void;
};

// Q16: gutter row line-height MUST equal content row line-height. Content
// renders at `text-[13px] leading-[1.6]` → 13 × 1.6 = 20.8px per row. Gutter
// line numbers stay smaller (`text-[11px]`) for visual subordination but
// each gutter row is sized to LINE_HEIGHT_PX so the columns align at every
// row regardless of UI scale (--font-scale from Q15).
const LINE_HEIGHT_PX = 20.8;
const GUTTER_WIDTH_PX = 52;
// Padding on the textarea / pre that gutter rows must mirror so vertical
// alignment holds at the top and bottom of the scroll region.
const CONTENT_PADDING_X_PX = 16; // px-4
const CONTENT_PADDING_Y_PX = 12; // py-3 in edit, sticky-pre uses 0

export function TextPanel(props: TextPanelProps) {
  if (!props.locked) {
    return <EditView {...props} />;
  }
  return <LockedView {...props} />;
}

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

function EditView(props: TextPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (props.text.length === 0) return;
    textareaRef.current?.focus();
  }, [props.text.length]);

  const lines = useMemo(
    () => (props.text.length === 0 ? [] : props.text.split("\n")),
    [props.text],
  );

  // Q21 — measure each source line's rendered height. When wrap is off
  // every line is exactly LINE_HEIGHT_PX (no measurement needed); when
  // wrap is on, lines stretch across multiple visual rows and we need
  // the actual rendered height for gutter alignment.
  const lineHeights = useLineHeights({
    enabled: props.wrap && lines.length > 0,
    lineCount: lines.length,
    lineRefs,
    fallback: LINE_HEIGHT_PX,
    deps: [props.text, props.wrap],
  });

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
    <div className="relative flex flex-1 overflow-hidden bg-canvas">
      <Gutter
        lineHeights={lineHeights}
        activeNumber={null}
        ref={gutterRef}
        topPaddingPx={CONTENT_PADDING_Y_PX}
        bottomPaddingPx={CONTENT_PADDING_Y_PX}
      />
      <textarea
        ref={textareaRef}
        value={props.text}
        onChange={(e) => props.onTextChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current !== null) {
            gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }
          if (mirrorRef.current !== null) {
            mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }
        }}
        spellCheck={false}
        wrap={props.wrap ? "soft" : "off"}
        style={{
          whiteSpace: props.wrap ? "pre-wrap" : "pre",
          wordBreak: props.wrap ? "break-word" : "normal",
          lineHeight: `${LINE_HEIGHT_PX}px`,
          // Reserve scrollbar gutter so the textarea's content width
          // is stable whether the bar is currently visible or not.
          // The measure-mirror does the same so per-line wrap points
          // (and therefore heights) match exactly.
          scrollbarGutter: "stable",
          // Kill the macOS rubber-band bounce at scroll edges.
          overscrollBehavior: "none",
        }}
        className="flex-1 resize-none overflow-auto bg-canvas px-4 py-3 font-code text-[13px] text-fg outline-none"
      />
      {/* Q21 — invisible mirror used to measure per-line heights when
          wrap is on. Positioned exactly over the textarea, with the
          same width/padding/font, so visual-row count per line matches.
          `aria-hidden`, `pointer-events: none`, opacity 0 — never
          interactive, never seen. */}
      {props.wrap && (
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 overflow-y-scroll overflow-x-hidden font-code text-[13px]"
          style={{
            left: GUTTER_WIDTH_PX,
            paddingLeft: CONTENT_PADDING_X_PX,
            paddingRight: CONTENT_PADDING_X_PX,
            paddingTop: CONTENT_PADDING_Y_PX,
            paddingBottom: CONTENT_PADDING_Y_PX,
            opacity: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: `${LINE_HEIGHT_PX}px`,
            // Match the textarea's stable scrollbar gutter so wrap
            // points (and therefore measured heights) align exactly.
            scrollbarGutter: "stable",
          }}
        >
          {lines.map((content, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: mirror blocks are 1:1 with textarea lines; index IS the identity.
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
            >
              {content.length === 0 ? " " : content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lock mode
// ---------------------------------------------------------------------------

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

  // Q21 — measure each rendered LineRow's height for gutter alignment.
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lineHeights = useLineHeights({
    enabled: props.wrap && lines.length > 0,
    lineCount: lines.length,
    lineRefs,
    fallback: LINE_HEIGHT_PX,
    deps: [props.text, props.wrap],
  });

  return (
    <div className="flex flex-1 overflow-auto bg-canvas" style={{ overscrollBehavior: "none" }}>
      <div className="flex flex-1">
        <Gutter lineHeights={lineHeights} activeNumber={activeNumber} sticky />

        <pre
          className="flex-1 px-4 font-code text-[13px] text-fg"
          style={{
            lineHeight: `${LINE_HEIGHT_PX}px`,
            whiteSpace: props.wrap ? "pre-wrap" : "pre",
            wordBreak: props.wrap ? "break-word" : "normal",
          }}
        >
          {lines.map((l, i) => (
            <LineRow
              key={l.number}
              content={l.content}
              isActive={l.number === activeNumber}
              isPaused={isPaused}
              wrap={props.wrap}
              spanRef={(el) => {
                lineRefs.current[i] = el;
              }}
            />
          ))}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useLineHeights — measure each source line's rendered height.
// ---------------------------------------------------------------------------

type UseLineHeightsArgs = {
  enabled: boolean;
  lineCount: number;
  lineRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  fallback: number;
  // biome-ignore lint/suspicious/noExplicitAny: dependency list shape varies
  deps: any[];
};

function useLineHeights({
  enabled,
  lineCount,
  lineRefs,
  fallback,
  deps,
}: UseLineHeightsArgs): number[] {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: lineCount }, () => fallback),
  );

  useLayoutEffect(() => {
    if (!enabled) {
      setHeights(Array.from({ length: lineCount }, () => fallback));
      return;
    }
    const measure = () => {
      const next: number[] = [];
      for (let i = 0; i < lineCount; i += 1) {
        const el = lineRefs.current[i];
        next.push(el !== null && el !== undefined ? el.getBoundingClientRect().height : fallback);
      }
      setHeights((prev) => {
        if (prev.length === next.length && prev.every((h, i) => h === next[i])) return prev;
        return next;
      });
    };
    measure();

    // Re-measure on container resize (the wrap point depends on width).
    const observers: ResizeObserver[] = [];
    for (let i = 0; i < lineCount; i += 1) {
      const el = lineRefs.current[i];
      if (el === null || el === undefined) continue;
      const obs = new ResizeObserver(measure);
      obs.observe(el);
      observers.push(obs);
    }
    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, [enabled, lineCount, fallback, lineRefs, ...deps]);

  return heights;
}

// ---------------------------------------------------------------------------
// Gutter
// ---------------------------------------------------------------------------

type GutterProps = {
  lineHeights: number[];
  activeNumber: number | null;
  sticky?: boolean;
  topPaddingPx?: number;
  bottomPaddingPx?: number;
  ref?: React.Ref<HTMLDivElement>;
};

function Gutter({
  lineHeights,
  activeNumber,
  sticky,
  topPaddingPx = 0,
  bottomPaddingPx = 0,
  ref,
}: GutterProps) {
  const className = `${sticky ? "sticky left-0 " : ""}shrink-0 overflow-hidden border-r border-hairline-soft bg-rail font-code text-[11px]`;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        paddingTop: topPaddingPx,
        paddingBottom: bottomPaddingPx,
        width: `${GUTTER_WIDTH_PX}px`,
      }}
      aria-hidden="true"
    >
      {lineHeights.map((h, i) => {
        const n = i + 1;
        const isActive = activeNumber !== null && n === activeNumber;
        return (
          <div
            key={n}
            className={`pr-3 text-right ${
              isActive ? "font-medium text-fg-secondary" : "text-fg-tertiary"
            }`}
            style={{
              // Top-align the number so wrapped lines show the number
              // at the start (VSCode behaviour). leading-loose row
              // height is the source line's measured height.
              height: `${h}px`,
              lineHeight: `${LINE_HEIGHT_PX}px`,
            }}
          >
            {isActive ? "→ " : ""}
            {n}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineRow
// ---------------------------------------------------------------------------

function LineRow({
  content,
  isActive,
  isPaused,
  wrap,
  spanRef,
}: {
  content: string;
  isActive: boolean;
  isPaused: boolean;
  wrap: boolean;
  spanRef?: (el: HTMLSpanElement | null) => void;
}) {
  const wrapClass = wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre";
  const baseStyle = `relative block ${wrapClass}`;
  if (!isActive) {
    return (
      <span ref={spanRef} className={baseStyle}>
        {content || " "}
      </span>
    );
  }
  return (
    <span
      ref={spanRef}
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
