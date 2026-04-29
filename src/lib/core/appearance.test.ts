import { describe, expect, it } from "vitest";
import {
  ALL_THEME_CLASSES,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  isScaleNear,
  isThemeMode,
  isThemeProfile,
  parseFontSize,
  resolveTheme,
  themeClassFor,
} from "./appearance";

describe("parseFontSize", () => {
  it("returns the value when within range", () => {
    expect(parseFontSize(1.0)).toBe(1.0);
    expect(parseFontSize(1.15)).toBe(1.15);
    expect(parseFontSize(1.3)).toBe(1.3);
  });

  it("clamps below FONT_SIZE_MIN", () => {
    expect(parseFontSize(0.1)).toBe(FONT_SIZE_MIN);
    expect(parseFontSize(-1)).toBe(FONT_SIZE_MIN);
  });

  it("clamps above FONT_SIZE_MAX", () => {
    expect(parseFontSize(5)).toBe(FONT_SIZE_MAX);
    expect(parseFontSize(2.5)).toBe(FONT_SIZE_MAX);
  });

  it("falls back to default on garbage", () => {
    expect(parseFontSize("not a number")).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(null)).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(undefined)).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(Number.NaN)).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(Number.POSITIVE_INFINITY)).toBe(FONT_SIZE_DEFAULT);
  });

  it("parses stringified numbers", () => {
    expect(parseFontSize("1.15")).toBe(1.15);
    expect(parseFontSize("1.3")).toBe(1.3);
  });
});

describe("isScaleNear", () => {
  it("returns true for identical values", () => {
    expect(isScaleNear(1.15, 1.15)).toBe(true);
  });

  it("returns true within default epsilon", () => {
    expect(isScaleNear(1.15, 1.1505)).toBe(true);
  });

  it("returns false outside default epsilon", () => {
    expect(isScaleNear(1.15, 1.16)).toBe(false);
  });

  it("respects a custom epsilon", () => {
    expect(isScaleNear(1.0, 1.05, 0.1)).toBe(true);
    expect(isScaleNear(1.0, 1.05, 0.01)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("system follows OS dark", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("system follows OS light", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("light returns light regardless of OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("dark returns dark regardless of OS", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeClassFor", () => {
  it("returns empty string for atelier+dark (the bare base)", () => {
    expect(themeClassFor("atelier", "dark")).toBe("");
  });

  it("returns theme-atelier-light for atelier+light", () => {
    expect(themeClassFor("atelier", "light")).toBe("theme-atelier-light");
  });

  it("returns theme-solarized-dark for solarized+dark", () => {
    expect(themeClassFor("solarized", "dark")).toBe("theme-solarized-dark");
  });

  it("returns theme-solarized-light for solarized+light", () => {
    expect(themeClassFor("solarized", "light")).toBe("theme-solarized-light");
  });

  it("returns theme-nord-dark for nord+dark", () => {
    expect(themeClassFor("nord", "dark")).toBe("theme-nord-dark");
  });

  it("returns theme-contrast-light for contrast+light", () => {
    expect(themeClassFor("contrast", "light")).toBe("theme-contrast-light");
  });
});

describe("isThemeProfile", () => {
  it("accepts each known profile", () => {
    expect(isThemeProfile("atelier")).toBe(true);
    expect(isThemeProfile("solarized")).toBe(true);
    expect(isThemeProfile("nord")).toBe(true);
    expect(isThemeProfile("dracula")).toBe(true);
    expect(isThemeProfile("contrast")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isThemeProfile("monokai")).toBe(false);
    expect(isThemeProfile("")).toBe(false);
    expect(isThemeProfile(null)).toBe(false);
    expect(isThemeProfile(42)).toBe(false);
  });
});

describe("isThemeMode", () => {
  it("accepts each known mode", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isThemeMode("auto")).toBe(false);
    expect(isThemeMode("")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });
});

describe("ALL_THEME_CLASSES", () => {
  it("excludes the empty atelier-dark class", () => {
    expect(ALL_THEME_CLASSES).not.toContain("");
  });

  it("includes all nine non-base classes", () => {
    // 5 profiles × 2 modes = 10 combinations; minus atelier+dark (the
    // bare base — empty string, excluded) = 9 named classes.
    expect(ALL_THEME_CLASSES).toEqual(
      expect.arrayContaining([
        "theme-atelier-light",
        "theme-solarized-dark",
        "theme-solarized-light",
        "theme-nord-dark",
        "theme-nord-light",
        "theme-dracula-dark",
        "theme-dracula-light",
        "theme-contrast-dark",
        "theme-contrast-light",
      ]),
    );
    expect(ALL_THEME_CLASSES).toHaveLength(9);
  });
});
