import { describe, expect, it } from "vitest";
import { allGatesPass, computeGates, failingGateCount, type GateInputs } from "./gates";

const baseline: GateInputs = {
  text: "",
  locked: false,
  lineCheckOk: null,
  region: null,
  permissions: null,
};

describe("computeGates", () => {
  it("text gate passes when locked and text non-empty", () => {
    const gates = computeGates({ ...baseline, text: "hello", locked: true });
    expect(gates.text).toBe(true);
  });

  it("text gate fails when text is set but not locked", () => {
    const gates = computeGates({ ...baseline, text: "hello", locked: false });
    expect(gates.text).toBe(false);
  });

  it("text gate fails when locked but text empty", () => {
    const gates = computeGates({ ...baseline, text: "", locked: true });
    expect(gates.text).toBe(false);
  });

  it("lines gate passes only when lineCheckOk === true", () => {
    expect(computeGates({ ...baseline, lineCheckOk: true }).lines).toBe(true);
    expect(computeGates({ ...baseline, lineCheckOk: false }).lines).toBe(false);
    expect(computeGates({ ...baseline, lineCheckOk: null }).lines).toBe(false);
  });

  it("region gate passes when region object is present", () => {
    expect(computeGates({ ...baseline, region: null }).region).toBe(false);
    expect(computeGates({ ...baseline, region: { x: 0, y: 0, w: 100, h: 100 } }).region).toBe(true);
  });

  it("permissions gate passes only when both perms are granted", () => {
    expect(computeGates({ ...baseline, permissions: null }).permissions).toBe(false);
    expect(
      computeGates({
        ...baseline,
        permissions: { accessibility: true, screenRecording: false },
      }).permissions,
    ).toBe(false);
    expect(
      computeGates({
        ...baseline,
        permissions: { accessibility: false, screenRecording: true },
      }).permissions,
    ).toBe(false);
    expect(
      computeGates({
        ...baseline,
        permissions: { accessibility: true, screenRecording: true },
      }).permissions,
    ).toBe(true);
  });
});

describe("allGatesPass", () => {
  it("returns true only when every gate passes", () => {
    const allPass = computeGates({
      text: "hello",
      locked: true,
      lineCheckOk: true,
      region: { x: 0, y: 0, w: 100, h: 100 },
      permissions: { accessibility: true, screenRecording: true },
    });
    expect(allGatesPass(allPass)).toBe(true);
  });

  it("returns false if any single gate fails", () => {
    expect(allGatesPass({ text: false, lines: true, region: true, permissions: true })).toBe(false);
    expect(allGatesPass({ text: true, lines: false, region: true, permissions: true })).toBe(false);
    expect(allGatesPass({ text: true, lines: true, region: false, permissions: true })).toBe(false);
    expect(allGatesPass({ text: true, lines: true, region: true, permissions: false })).toBe(false);
  });
});

describe("failingGateCount", () => {
  it("counts the number of ✗ gates", () => {
    expect(failingGateCount({ text: false, lines: false, region: false, permissions: false })).toBe(
      4,
    );
    expect(failingGateCount({ text: true, lines: false, region: false, permissions: false })).toBe(
      3,
    );
    expect(failingGateCount({ text: true, lines: true, region: true, permissions: true })).toBe(0);
  });

  it("counts intermediate values (1 and 2 failing)", () => {
    // Fills the 0/3/4 gap from the test above. Pins arithmetic at the
    // mid-points where off-by-one bugs would surface.
    expect(failingGateCount({ text: true, lines: true, region: true, permissions: false })).toBe(1);
    expect(failingGateCount({ text: true, lines: true, region: false, permissions: false })).toBe(
      2,
    );
  });
});
