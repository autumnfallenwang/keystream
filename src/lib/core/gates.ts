// v2 pre-task gates. Down from 4 (text/lines/region/permissions) to 2.
// Pure module — no Tauri imports.

export type GateName = "text" | "accessibility";

export type GateStates = Record<GateName, boolean>;

export type Permissions = { accessibility: boolean };

export type GateInputs = {
  text: string;
  locked: boolean;
  permissions: Permissions | null;
};

export function computeGates(inputs: GateInputs): GateStates {
  return {
    // Text gate passes only when the text panel is locked AND non-empty.
    // Editing mode is treated as "not yet ready to send".
    text: inputs.locked && inputs.text.length > 0,
    accessibility: inputs.permissions?.accessibility ?? false,
  };
}

export function allGatesPass(gates: GateStates): boolean {
  return gates.text && gates.accessibility;
}
