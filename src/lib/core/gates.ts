// Pure gate-state computation for the pre-task gate strip (task 34).
// No Tauri imports, no React — testable in vitest with no mocks.
//
// Tasks 35 (region), 36 (lines), 42 (permissions) progressively fill in
// the inputs; computeGates returns ✓ for each as the inputs become real.

export type GateName = "text" | "lines" | "region" | "permissions";

export type GateStates = Record<GateName, boolean>;

export type Region = { x: number; y: number; w: number; h: number };

export type Permissions = { accessibility: boolean; screenRecording: boolean };

export type GateInputs = {
  text: string;
  locked: boolean;
  // null = check has not run yet → treated as ✗
  lineCheckOk: boolean | null;
  region: Region | null;
  permissions: Permissions | null;
};

export function computeGates(inputs: GateInputs): GateStates {
  return {
    text: inputs.locked && inputs.text.length > 0,
    lines: inputs.lineCheckOk === true,
    region: inputs.region !== null,
    permissions: (inputs.permissions?.accessibility && inputs.permissions.screenRecording) ?? false,
  };
}

export function allGatesPass(gates: GateStates): boolean {
  return gates.text && gates.lines && gates.region && gates.permissions;
}

export function failingGateCount(gates: GateStates): number {
  return (
    (gates.text ? 0 : 1) +
    (gates.lines ? 0 : 1) +
    (gates.region ? 0 : 1) +
    (gates.permissions ? 0 : 1)
  );
}
