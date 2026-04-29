import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "./sidebar-width";

describe("clampSidebarWidth", () => {
  it("returns in-range values unchanged", () => {
    expect(clampSidebarWidth(300)).toBe(300);
    expect(clampSidebarWidth(260)).toBe(260);
  });

  it("clamps below floor up to SIDEBAR_WIDTH_MIN", () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(-1)).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("clamps above ceiling down to SIDEBAR_WIDTH_MAX", () => {
    expect(clampSidebarWidth(1000)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampSidebarWidth(601)).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("falls back to SIDEBAR_WIDTH_DEFAULT on non-numeric input", () => {
    expect(clampSidebarWidth("abc")).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(null)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(undefined)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });

  it("rounds non-integer values to nearest integer", () => {
    expect(clampSidebarWidth(300.7)).toBe(301);
    expect(clampSidebarWidth(300.3)).toBe(300);
  });

  it("passes exact floor / ceiling through unchanged", () => {
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX)).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("parses stringified numbers", () => {
    expect(clampSidebarWidth("300")).toBe(300);
    expect(clampSidebarWidth("100")).toBe(SIDEBAR_WIDTH_MIN);
  });
});
