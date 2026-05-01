"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { Upload } from "lucide-react";
import { useEffect, useRef } from "react";
import { activeLineIndex } from "@/lib/core/active-line";
import type { AppState } from "@/lib/core/app-state";
import { pickLanguage } from "@/lib/core/file-tree";

export type TextPanelProps = {
  text: string;
  locked: boolean;
  state: AppState;
  /** Q21 — when true, soft-wrap long lines. Default off. */
  wrap: boolean;
  /** Q22 — drives `pickLanguage` for syntax highlighting. Null when no
   * file is loaded (free-text editing). */
  filename: string | null;
  onTextChange: (next: string) => void;
  onLoadFile: () => void;
};

export function TextPanel(props: TextPanelProps) {
  if (props.text.length === 0) {
    return <EmptyState onLoadFile={props.onLoadFile} />;
  }
  return <Editor {...props} />;
}

function EmptyState({ onLoadFile }: { onLoadFile: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[14px] text-fg-tertiary">Drop a file here, or click to load</p>
      <button
        type="button"
        onClick={onLoadFile}
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

// ---------------------------------------------------------------------------
// Active-line StateField (Q14). A Decoration.line carrying the
// `cm-active-glow` (and optionally `cm-active-paused`) class plus a
// data-testid for tests. The field listens for setActiveLine effects
// dispatched whenever charsTyped / mode change.
// ---------------------------------------------------------------------------

type ActiveLineState = { lineIndex: number; isPaused: boolean };
const setActiveLine = StateEffect.define<ActiveLineState>();

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setActiveLine)) continue;
      const { lineIndex, isPaused } = e.value;
      if (lineIndex < 0 || lineIndex >= tr.state.doc.lines) {
        next = Decoration.none;
        continue;
      }
      const line = tr.state.doc.line(lineIndex + 1); // CM lines are 1-indexed
      next = Decoration.set([
        Decoration.line({
          class: `cm-active-glow${isPaused ? " cm-active-paused" : ""}`,
          attributes: {
            "data-testid": "active-line",
            "data-paused": isPaused ? "true" : "false",
          },
        }).range(line.from),
      ]);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------------------
// Editor — CodeMirror 6 mount. Three Compartments allow per-prop
// reconfiguration without tearing down the editor (preserves cursor,
// scroll, and undo history across prop changes).
// ---------------------------------------------------------------------------

function Editor(props: TextPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<{
    readOnly: Compartment;
    wrap: Compartment;
    lang: Compartment;
  } | null>(null);
  // Tracks the doc value the editor last emitted/received, so external
  // text changes can short-circuit when the editor already has it.
  const lastTextRef = useRef<string>(props.text);
  // The updateListener closes over the latest onTextChange via this ref.
  const onTextChangeRef = useRef(props.onTextChange);
  onTextChangeRef.current = props.onTextChange;

  // Mount once. Reconfigurations happen via the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once on purpose. Each prop is reconfigured by its own effect.
  useEffect(() => {
    if (hostRef.current === null) return;

    const readOnlyComp = new Compartment();
    const wrapComp = new Compartment();
    const langComp = new Compartment();
    compartmentsRef.current = { readOnly: readOnlyComp, wrap: wrapComp, lang: langComp };

    const initialLang = pickLanguage(props.filename);
    const view = new EditorView({
      doc: props.text,
      parent: hostRef.current,
      extensions: [
        lineNumbers(),
        history(),
        // Q22 — search/find panel. ⌘F opens it; bound below via
        // searchKeymap. Keep `top: true` so the bar appears above the
        // editor instead of beneath the viewport (the lib's default).
        search({ top: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        // Q22 — paints tokens emitted by the active language extension.
        // Without this, the parser still runs but no colors are rendered.
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        readOnlyComp.of(EditorView.editable.of(!props.locked)),
        wrapComp.of(props.wrap ? [EditorView.lineWrapping] : []),
        langComp.of(initialLang ?? []),
        activeLineField,
        EditorView.theme({
          "&": {
            // Q22 — driven by --editor-font-size CSS var so the
            // settings dial applies live without rebuilding the editor.
            fontSize: "var(--editor-font-size, 13px)",
            height: "100%",
            width: "100%",
            backgroundColor: "var(--bg-canvas)",
            color: "var(--fg-primary)",
          },
          ".cm-scroller": {
            fontFamily: "var(--font-code), var(--font-geist-mono), monospace",
            lineHeight: "1.6",
            overflow: "auto",
          },
          ".cm-content": { caretColor: "var(--accent)" },
          // Q22 — gutter colors track our palette tokens so dark/light
          // mode swaps invert the gutter alongside the rest of the app.
          ".cm-gutters": {
            backgroundColor: "var(--bg-rail)",
            color: "var(--fg-tertiary)",
            borderRight: "1px solid var(--hairline-soft)",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            color: "var(--fg-tertiary)",
            padding: "0 12px 0 8px",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "transparent",
            color: "var(--fg-secondary)",
          },
          // Selection background: respect the theme's accent glow.
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "var(--accent-glow) !important",
          },
          // Q22 — search panel theming. Inherits palette tokens so it
          // inverts with light/dark mode automatically. The editor
          // root is counter-zoomed to escape Q15's --font-scale (so
          // CM hit-tests are stable). The search bar is UI chrome
          // though, not editor content — undo the counter-zoom on
          // .cm-panels so it scales with the rest of the app.
          ".cm-panels": {
            backgroundColor: "var(--bg-rail)",
            color: "var(--fg-primary)",
            borderBottom: "1px solid var(--hairline-soft)",
            zoom: "var(--font-scale)",
          },
          ".cm-panels.cm-panels-top": {
            borderBottom: "1px solid var(--hairline-soft)",
          },
          ".cm-search": {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 10px",
          },
          ".cm-search input, .cm-textfield": {
            backgroundColor: "var(--bg-canvas)",
            color: "var(--fg-primary)",
            border: "1px solid var(--hairline-soft)",
            borderRadius: "4px",
            padding: "3px 8px",
            fontSize: "12px",
            fontFamily: "var(--font-code), monospace",
            outline: "none",
          },
          ".cm-search input:focus, .cm-textfield:focus": {
            borderColor: "var(--accent)",
          },
          ".cm-search button, .cm-button": {
            backgroundColor: "var(--bg-elevated, var(--bg-canvas))",
            color: "var(--fg-secondary)",
            border: "1px solid var(--hairline-soft)",
            borderRadius: "4px",
            padding: "3px 8px",
            fontSize: "11px",
            cursor: "pointer",
            backgroundImage: "none",
          },
          ".cm-search button:hover, .cm-button:hover": {
            backgroundColor: "var(--bg-hover, var(--bg-canvas))",
            color: "var(--fg-primary)",
          },
          ".cm-search label": {
            color: "var(--fg-tertiary)",
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          },
          ".cm-search [name='close']": {
            color: "var(--fg-tertiary)",
            background: "transparent",
            border: "none",
            fontSize: "16px",
          },
          ".cm-searchMatch": {
            backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
          },
          ".cm-searchMatch-selected": {
            backgroundColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
            outline: "1px solid var(--accent)",
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          if (next === lastTextRef.current) return;
          lastTextRef.current = next;
          // Defer to the next microtask so React's setState lands after
          // the CodeMirror transaction settles (React 19 strict mode).
          queueMicrotask(() => onTextChangeRef.current(next));
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      compartmentsRef.current = null;
    };
  }, []);

  // External text changes (file load, clear). Short-circuit if the
  // editor's doc already matches — prevents the user-typing → setText →
  // effect-fire → editor-reset loop.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (props.text === lastTextRef.current) return;
    lastTextRef.current = props.text;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.text },
    });
  }, [props.text]);

  // Lock toggle.
  useEffect(() => {
    const view = viewRef.current;
    const c = compartmentsRef.current;
    if (view === null || c === null) return;
    view.dispatch({
      effects: c.readOnly.reconfigure(EditorView.editable.of(!props.locked)),
    });
  }, [props.locked]);

  // Wrap toggle (Q21).
  useEffect(() => {
    const view = viewRef.current;
    const c = compartmentsRef.current;
    if (view === null || c === null) return;
    view.dispatch({
      effects: c.wrap.reconfigure(props.wrap ? [EditorView.lineWrapping] : []),
    });
  }, [props.wrap]);

  // Language autodetection (Q22).
  useEffect(() => {
    const view = viewRef.current;
    const c = compartmentsRef.current;
    if (view === null || c === null) return;
    const lang = pickLanguage(props.filename);
    view.dispatch({ effects: c.lang.reconfigure(lang ?? []) });
  }, [props.filename]);

  // Active-line indicator (Q14). On every charsTyped tick, repaint the
  // decoration AND scroll the active line into view so it stays visible
  // when the send walks past the bottom of the viewport. Decoration
  // dispatched first; scroll dispatched second so its measurement
  // phase doesn't interfere with the decoration commit.
  const charsTyped = sendingCharsTyped(props.state);
  const isActiveSend = props.state.mode === "sending" || props.state.mode === "paused";
  const isPaused = props.state.mode === "paused";
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const idx = isActiveSend ? activeLineIndex(props.text, charsTyped) : -1;
    view.dispatch({ effects: setActiveLine.of({ lineIndex: idx, isPaused }) });
    if (idx >= 0 && idx < view.state.doc.lines) {
      const line = view.state.doc.line(idx + 1);
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "nearest" }),
      });
    }
  }, [charsTyped, isActiveSend, isPaused, props.text]);

  return (
    <div
      ref={hostRef}
      className="relative flex-1 overflow-hidden bg-canvas"
      data-testid="cm-host"
    />
  );
}

function sendingCharsTyped(state: AppState): number {
  if (state.mode === "sending" || state.mode === "paused") return state.charsTyped;
  return 0;
}
