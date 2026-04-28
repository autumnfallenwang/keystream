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

export function TextPanel(props: TextPanelProps) {
  if (!props.locked) {
    return <EditView {...props} />;
  }
  return <LockedView {...props} />;
}

function EditView(props: TextPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (props.text.length === 0) return;
    textareaRef.current?.focus();
  }, [props.text.length]);

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
    <div className="flex flex-1 flex-col overflow-hidden">
      <textarea
        ref={textareaRef}
        value={props.text}
        onChange={(e) => props.onTextChange(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none bg-canvas px-4 py-3 font-code text-[13px] leading-[1.6] text-fg outline-none"
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
  const isPaused = props.state.mode === "paused";

  return (
    <div className="flex flex-1 overflow-auto bg-canvas">
      <div className="flex flex-1">
        <div className="sticky left-0 w-[52px] shrink-0 border-r border-hairline-soft bg-rail">
          {lines.map((l) => (
            <div
              key={l.number}
              className={`pr-3 text-right font-code text-[11px] leading-[1.6] ${
                l.number === activeIdx + 1 ? "font-medium text-fg-secondary" : "text-fg-tertiary"
              }`}
            >
              {l.number === activeIdx + 1 ? "→ " : ""}
              {l.number}
            </div>
          ))}
        </div>

        <pre className="flex-1 px-4 font-code text-[13px] leading-[1.6] text-fg">
          {lines.map((l) => (
            <LineRow
              key={l.number}
              content={l.content}
              isActive={l.number === activeIdx + 1}
              isPaused={isPaused}
            />
          ))}
        </pre>
      </div>
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
