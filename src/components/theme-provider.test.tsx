import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppearanceCfg } from "@/lib/core/appearance";
import { ThemeProvider } from "./theme-provider";

const ALL_CLASSES = [
  "theme-atelier-light",
  "theme-solarized-dark",
  "theme-solarized-light",
  "theme-nord-dark",
  "theme-nord-light",
  "theme-contrast-dark",
  "theme-contrast-light",
];

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.add(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.delete(handler);
    }),
    dispatchChange: (next: boolean) => {
      mql.matches = next;
      for (const h of listeners) {
        h({ matches: next } as MediaQueryListEvent);
      }
    },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => mql),
  });
  return mql;
}

afterEach(() => {
  // Reset <html> after each test.
  for (const cls of ALL_CLASSES) document.documentElement.classList.remove(cls);
  document.documentElement.style.removeProperty("--font-scale");
});

describe("ThemeProvider — class application", () => {
  beforeEach(() => mockMatchMedia(true));

  it("applies no class for atelier+dark (the bare base)", () => {
    const appearance: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    for (const cls of ALL_CLASSES) {
      expect(document.documentElement.classList.contains(cls)).toBe(false);
    }
  });

  it("applies theme-solarized-dark for solarized+dark", () => {
    const appearance: AppearanceCfg = { profile: "solarized", mode: "dark", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.classList.contains("theme-solarized-dark")).toBe(true);
  });

  it("applies theme-nord-light for nord+light", () => {
    const appearance: AppearanceCfg = { profile: "nord", mode: "light", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.classList.contains("theme-nord-light")).toBe(true);
  });

  it("clears prior theme classes when profile changes", () => {
    const initial: AppearanceCfg = { profile: "solarized", mode: "dark", fontSize: 1.0 };
    const next: AppearanceCfg = { profile: "nord", mode: "dark", fontSize: 1.0 };
    const { rerender } = render(<ThemeProvider appearance={initial} />);
    expect(document.documentElement.classList.contains("theme-solarized-dark")).toBe(true);
    rerender(<ThemeProvider appearance={next} />);
    expect(document.documentElement.classList.contains("theme-solarized-dark")).toBe(false);
    expect(document.documentElement.classList.contains("theme-nord-dark")).toBe(true);
  });
});

describe("ThemeProvider — system mode follows matchMedia", () => {
  it("resolves to dark when OS prefers dark", () => {
    mockMatchMedia(true);
    const appearance: AppearanceCfg = { profile: "solarized", mode: "system", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.classList.contains("theme-solarized-dark")).toBe(true);
  });

  it("resolves to light when OS prefers light", () => {
    mockMatchMedia(false);
    const appearance: AppearanceCfg = { profile: "solarized", mode: "system", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.classList.contains("theme-solarized-light")).toBe(true);
  });

  it("re-applies when matchMedia change event fires", () => {
    const mql = mockMatchMedia(false);
    const appearance: AppearanceCfg = { profile: "nord", mode: "system", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.classList.contains("theme-nord-light")).toBe(true);
    mql.dispatchChange(true);
    expect(document.documentElement.classList.contains("theme-nord-dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-nord-light")).toBe(false);
  });

  it("does not subscribe to matchMedia when mode is not system", () => {
    const mql = mockMatchMedia(true);
    const appearance: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(mql.addEventListener).not.toHaveBeenCalled();
  });

  it("removes the matchMedia listener on unmount", () => {
    const mql = mockMatchMedia(true);
    const appearance: AppearanceCfg = { profile: "nord", mode: "system", fontSize: 1.0 };
    const { unmount } = render(<ThemeProvider appearance={appearance} />);
    expect(mql.addEventListener).toHaveBeenCalled();
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});

describe("ThemeProvider — font-scale CSS var", () => {
  beforeEach(() => mockMatchMedia(true));

  it("sets --font-scale to 1 by default", () => {
    const appearance: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.0 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1");
  });

  it("sets --font-scale to 1.3 for Large", () => {
    const appearance: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.3 };
    render(<ThemeProvider appearance={appearance} />);
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.3");
  });

  it("updates --font-scale when fontSize prop changes", () => {
    const initial: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.0 };
    const next: AppearanceCfg = { profile: "atelier", mode: "dark", fontSize: 1.5 };
    const { rerender } = render(<ThemeProvider appearance={initial} />);
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1");
    rerender(<ThemeProvider appearance={next} />);
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.5");
  });
});
