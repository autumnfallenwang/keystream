import { describe, expect, it } from "vitest";
import { allGatesPass, computeGates } from "./gates";

describe("computeGates", () => {
  it("text gate is false when not locked", () => {
    const gates = computeGates({
      text: "hello",
      locked: false,
      permissions: { accessibility: true },
    });
    expect(gates.text).toBe(false);
  });

  it("text gate is false when locked but empty", () => {
    const gates = computeGates({
      text: "",
      locked: true,
      permissions: { accessibility: true },
    });
    expect(gates.text).toBe(false);
  });

  it("text gate is true when locked and non-empty", () => {
    const gates = computeGates({
      text: "hello",
      locked: true,
      permissions: { accessibility: true },
    });
    expect(gates.text).toBe(true);
  });

  it("accessibility gate is false when permissions null", () => {
    const gates = computeGates({ text: "x", locked: true, permissions: null });
    expect(gates.accessibility).toBe(false);
  });

  it("accessibility gate reflects the permissions probe", () => {
    expect(
      computeGates({ text: "x", locked: true, permissions: { accessibility: false } })
        .accessibility,
    ).toBe(false);
    expect(
      computeGates({ text: "x", locked: true, permissions: { accessibility: true } }).accessibility,
    ).toBe(true);
  });
});

describe("allGatesPass", () => {
  it("requires both gates", () => {
    expect(allGatesPass({ text: true, accessibility: true })).toBe(true);
    expect(allGatesPass({ text: false, accessibility: true })).toBe(false);
    expect(allGatesPass({ text: true, accessibility: false })).toBe(false);
  });
});
