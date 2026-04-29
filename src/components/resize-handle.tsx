"use client";

// Q19 — drag handle for the sidebar's right edge.
//
// Pure relative drag: mousedown captures the cursor's starting clientX
// AND the sidebar's current width. Every mousemove computes
// `newWidth = startWidth + (ev.clientX - startX)`. Mouseup commits.
//
// Why relative-only: the handle is 4px wide; the cursor lands somewhere
// inside it on click. Snap-to-cursor causes a 1-3px jump on click
// (visible even without dragging). Anchor-with-fixed-offset eliminates
// the click jump but leaves a permanent visible gap between cursor and
// edge equal to the click offset. Pure relative motion has neither
// problem — clicks without motion are zero-impact, and the edge
// matches cursor motion exactly from the moment dragging starts.
//
// Mousemove + mouseup listeners attach to `window` so dragging past
// the handle's bounds still tracks.

import { useRef } from "react";
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "@/lib/core/sidebar-width";

export type ResizeHandleProps = {
  /** Live update — fires on every mousemove during a drag. */
  onResize: (px: number) => void;
  /** Commit — fires on mouseup or double-click. */
  onCommit: (px: number) => void;
  /** Width to reset to on double-click. Defaults to SIDEBAR_WIDTH_DEFAULT. */
  defaultPx?: number;
  /** Current width in px. Captured at mousedown as the drag's anchor;
   * also surfaced via aria-valuenow for screen readers. */
  currentPx?: number;
};

export function ResizeHandle({
  onResize,
  onCommit,
  defaultPx = SIDEBAR_WIDTH_DEFAULT,
  currentPx = SIDEBAR_WIDTH_DEFAULT,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    // Snapshot the drag's anchor: where the cursor started + how wide
    // the sidebar was at that moment. Both stay constant for the
    // duration of this drag. Width updates are computed from the
    // cursor's *delta* relative to startX, never from raw clientX.
    const startX = e.clientX;
    const startWidth = currentPx;

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = ev.clientX - startX;
      onResize(clampSidebarWidth(startWidth + delta));
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const delta = ev.clientX - startX;
      onCommit(clampSidebarWidth(startWidth + delta));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleDoubleClick = () => {
    onCommit(defaultPx);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: <hr> can't carry draggable
    // mouse handlers; this is a visual slider/splitter widget, not a divider.
    <div
      role="slider"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={currentPx}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      tabIndex={0}
      data-testid="sidebar-resize-handle"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/30"
    />
  );
}
