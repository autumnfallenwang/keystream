// Q19 — sidebar-width constants and clamp helper.
//
// The sidebar (both main `<Sidebar>` and `<SettingsSidebar>`) is
// user-resizable via a drag handle on the right edge. Width values are
// clamped to [SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX] on every commit
// (mouseup, double-click reset, settings load).
//
// Mirrors the `sidebar_width_px` field in `src-tauri/src/settings.rs`
// (Rust default also 260).

export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 600;
export const SIDEBAR_WIDTH_DEFAULT = 260;

/** Clamp + round to integer pixels. NaN / non-numeric input falls back
 * to SIDEBAR_WIDTH_DEFAULT. */
export function clampSidebarWidth(px: unknown): number {
  const n = typeof px === "number" ? px : Number.parseFloat(String(px));
  if (!Number.isFinite(n)) return SIDEBAR_WIDTH_DEFAULT;
  if (n < SIDEBAR_WIDTH_MIN) return SIDEBAR_WIDTH_MIN;
  if (n > SIDEBAR_WIDTH_MAX) return SIDEBAR_WIDTH_MAX;
  return Math.round(n);
}
