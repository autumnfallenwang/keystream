"use client";

// Side-effect-only component (Q15 + Q19). Reads the user's appearance
// prefs and sidebar width from props and applies them to <html>:
//   - palette + mode → swaps the `theme-<profile>-<mode>` class on
//     :root (or clears it for the bare Atelier-dark base)
//   - font scale → sets the `--font-scale` CSS var on :root
//   - sidebar width → sets the `--sidebar-width` CSS var on :root
// When `mode === "system"`, listens to the OS color-scheme media query
// and re-applies live. Renders nothing.

import { useEffect } from "react";
import {
  ALL_THEME_CLASSES,
  type AppearanceCfg,
  resolveTheme,
  themeClassFor,
} from "@/lib/core/appearance";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

type Props = {
  appearance: AppearanceCfg;
  sidebarWidthPx: number;
};

export function ThemeProvider({ appearance, sidebarWidthPx }: Props): null {
  useEffect(() => {
    const mql =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia(MEDIA_QUERY);

    const apply = () => {
      const root = document.documentElement;
      const systemPrefersDark = mql?.matches ?? false;
      const resolved = resolveTheme(appearance.mode, systemPrefersDark);
      const targetClass = themeClassFor(appearance.profile, resolved);

      for (const cls of ALL_THEME_CLASSES) {
        if (cls !== targetClass) root.classList.remove(cls);
      }
      if (targetClass.length > 0) {
        root.classList.add(targetClass);
      }
      root.style.setProperty("--font-scale", String(appearance.fontSize));
      root.style.setProperty("--sidebar-width", `${sidebarWidthPx}px`);
    };

    apply();

    if (appearance.mode !== "system" || mql === null) {
      return;
    }

    const handle = () => apply();
    mql.addEventListener("change", handle);
    return () => mql.removeEventListener("change", handle);
  }, [appearance.profile, appearance.mode, appearance.fontSize, sidebarWidthPx]);

  return null;
}
