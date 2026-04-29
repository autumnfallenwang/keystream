// Pure appearance / theme helpers (Q15). No platform imports — the
// theme provider reads DOM state (matchMedia) and feeds it into
// `resolveTheme` to decide which palette class to apply.

export type ThemeProfile = "atelier" | "solarized" | "nord" | "dracula" | "contrast";
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

export type AppearanceCfg = {
  profile: ThemeProfile;
  mode: ThemeMode;
  fontSize: number;
};

const PROFILES: ReadonlySet<string> = new Set([
  "atelier",
  "solarized",
  "nord",
  "dracula",
  "contrast",
]);
const MODES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

export const THEME_PROFILES: ReadonlyArray<ThemeProfile> = [
  "atelier",
  "solarized",
  "nord",
  "dracula",
  "contrast",
];

export const THEME_MODES: ReadonlyArray<ThemeMode> = ["light", "dark", "system"];

export const PROFILE_LABELS: Readonly<Record<ThemeProfile, string>> = {
  atelier: "Terminal Atelier (default)",
  solarized: "Solarized",
  nord: "Nord",
  dracula: "Dracula",
  contrast: "High contrast",
};

export const PROFILE_DESCRIPTIONS: Readonly<Record<ThemeProfile, string>> = {
  atelier: "Calibrated dark with periwinkle accent. The app's house palette.",
  solarized: "Ethan Schoonover's classic warm-ochre and cyan.",
  nord: "Cool Arctic blue-gray. Calm and modern.",
  dracula: "Purple / pink / cyan on dark. Dark-first classic.",
  contrast: "WCAG AAA. Maximum contrast for accessibility.",
};

// UI-scale bounds. The settings UI permits 50–200% (0.5–2.0). Values
// outside the range are clamped so a user can't scale into uselessness.
export const FONT_SIZE_MIN = 0.5;
export const FONT_SIZE_MAX = 2.0;
export const FONT_SIZE_DEFAULT = 1.0;

export const FONT_SIZE_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1.0, label: "Small" },
  { value: 1.15, label: "Medium" },
  { value: 1.3, label: "Large" },
];

export function isThemeProfile(value: unknown): value is ThemeProfile {
  return typeof value === "string" && PROFILES.has(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && MODES.has(value);
}

/** Parse a stored font-size value (zoom factor as number or stringified
 * number) into a number clamped to [FONT_SIZE_MIN, FONT_SIZE_MAX].
 * Invalid input falls back to FONT_SIZE_DEFAULT. */
export function parseFontSize(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
  if (n < FONT_SIZE_MIN) return FONT_SIZE_MIN;
  if (n > FONT_SIZE_MAX) return FONT_SIZE_MAX;
  return n;
}

/** Compare two scale values within an epsilon — CSS rounding and
 * stringify round-trips shouldn't break preset highlighting. */
export function isScaleNear(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) < epsilon;
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedMode {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/** Map a profile + resolved mode to the CSS class name applied on
 * `<html>`. Atelier dark is the bare base (no class) so the
 * untouched `:root` rules in globals.css define it.
 *
 * Examples:
 *   themeClassFor("atelier", "dark")    -> ""
 *   themeClassFor("atelier", "light")   -> "theme-atelier-light"
 *   themeClassFor("solarized", "dark")  -> "theme-solarized-dark"
 */
export function themeClassFor(profile: ThemeProfile, resolved: ResolvedMode): string {
  if (profile === "atelier" && resolved === "dark") return "";
  return `theme-${profile}-${resolved}`;
}

/** All possible class names the theme provider may apply. Used to
 * clear stale classes before applying a new one. */
export const ALL_THEME_CLASSES: ReadonlyArray<string> = (() => {
  const out: string[] = [];
  for (const p of THEME_PROFILES) {
    for (const r of ["light", "dark"] as const) {
      const c = themeClassFor(p, r);
      if (c.length > 0) out.push(c);
    }
  }
  return out;
})();

export const APPEARANCE_DEFAULT: AppearanceCfg = {
  profile: "atelier",
  mode: "system",
  fontSize: FONT_SIZE_DEFAULT,
};
