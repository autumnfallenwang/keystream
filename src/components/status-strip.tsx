import type { GateName, GateStates, Permissions, Region } from "@/lib/core/gates";
import type { CheckLinesResult } from "@/lib/ipc";

const LABELS: Record<GateName, string> = {
  text: "Text",
  lines: "Lines",
  region: "Region",
  permissions: "Permissions",
};

const ORDER: GateName[] = ["text", "lines", "region", "permissions"];

const PASS_DOT = "size-3 rounded-full bg-emerald-500";
const FAIL_DOT = "size-3 rounded-full bg-zinc-400 dark:bg-zinc-600";
const ERROR_DOT = "size-3 rounded-full bg-red-500";
const PENDING_DOT = "size-3 rounded-full bg-amber-400 animate-pulse";

const PASS_BASE = "flex items-center gap-2 text-zinc-700 dark:text-zinc-300";
const FAIL_BASE = `${PASS_BASE} cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors`;
const ERROR_BASE =
  "flex items-center gap-2 text-red-600 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300 transition-colors";
const PENDING_BASE = "flex items-center gap-2 text-zinc-500 dark:text-zinc-400";

const BADGE =
  "ml-2 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs font-mono text-zinc-500 dark:text-zinc-400";

export type RegionDetail = {
  calibrating: boolean;
  error: string | null;
  region: Region | null;
};

export type LinesDetail = {
  result: CheckLinesResult | null;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export type PermissionsDetail = {
  permissions: Permissions | null;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export type StatusStripProps = {
  gates: GateStates;
  onRemediate: (name: GateName) => void;
  regionDetail: RegionDetail;
  linesDetail: LinesDetail;
  permissionsDetail: PermissionsDetail;
  clearDisabled: boolean;
  onClearClick: () => void;
};

function regionTooltip(r: Region): string {
  return `x=${r.x} y=${r.y} w=${r.w} h=${r.h}`;
}

function GenericIndicator({
  name,
  passing,
  onRemediate,
}: {
  name: GateName;
  passing: boolean;
  onRemediate: (name: GateName) => void;
}) {
  if (passing) {
    return (
      <span className={PASS_BASE}>
        <span className={PASS_DOT} aria-hidden />
        <span>{LABELS[name]}</span>
      </span>
    );
  }
  return (
    <button type="button" className={FAIL_BASE} onClick={() => onRemediate(name)}>
      <span className={FAIL_DOT} aria-hidden />
      <span>{LABELS[name]}</span>
    </button>
  );
}

function RegionIndicator({
  detail,
  passing,
  onRemediate,
}: {
  detail: RegionDetail;
  passing: boolean;
  onRemediate: (name: GateName) => void;
}) {
  if (detail.calibrating) {
    return (
      <span className={PENDING_BASE}>
        <span className={PENDING_DOT} aria-hidden />
        <span>Region · calibrating…</span>
      </span>
    );
  }
  if (detail.error !== null) {
    return (
      <button
        type="button"
        className={ERROR_BASE}
        title={detail.error}
        onClick={() => onRemediate("region")}
      >
        <span className={ERROR_DOT} aria-hidden />
        <span>Region · failed</span>
      </button>
    );
  }
  if (passing && detail.region !== null) {
    const r = detail.region;
    return (
      <span className={PASS_BASE} title={regionTooltip(r)}>
        <span className={PASS_DOT} aria-hidden />
        <span>Region</span>
        <span className={BADGE}>
          {r.w}×{r.h}
        </span>
      </span>
    );
  }
  return (
    <button type="button" className={FAIL_BASE} onClick={() => onRemediate("region")}>
      <span className={FAIL_DOT} aria-hidden />
      <span>Region</span>
    </button>
  );
}

function LinesIndicator({
  detail,
  passing,
  onRemediate,
}: {
  detail: LinesDetail;
  passing: boolean;
  onRemediate: (name: GateName) => void;
}) {
  const result = detail.result;
  if (result !== null && !result.ok) {
    const count = result.offending.length;
    const chevron = detail.expanded ? "▾" : "▸";
    return (
      <button type="button" className={ERROR_BASE} onClick={() => detail.onToggleExpanded()}>
        <span className={ERROR_DOT} aria-hidden />
        <span>Lines · {count} too long</span>
        <span className="text-xs" aria-hidden>
          {chevron}
        </span>
      </button>
    );
  }
  return <GenericIndicator name="lines" passing={passing} onRemediate={onRemediate} />;
}

function PermissionsIndicator({
  detail,
  passing,
  onRemediate,
}: {
  detail: PermissionsDetail;
  passing: boolean;
  onRemediate: (name: GateName) => void;
}) {
  const chevron = detail.expanded ? "▾" : "▸";
  const handler = passing ? () => detail.onToggleExpanded() : () => onRemediate("permissions");
  return (
    <button type="button" className={FAIL_BASE} onClick={handler}>
      <span className={passing ? PASS_DOT : FAIL_DOT} aria-hidden />
      <span>Permissions</span>
      <span className="text-xs" aria-hidden>
        {chevron}
      </span>
    </button>
  );
}

export function StatusStrip({
  gates,
  onRemediate,
  regionDetail,
  linesDetail,
  permissionsDetail,
  clearDisabled,
  onClearClick,
}: StatusStripProps) {
  return (
    <div className="h-15 shrink-0 flex items-center gap-6 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm">
      <div className="flex items-center gap-4">
        {ORDER.map((name) => {
          if (name === "region") {
            return (
              <RegionIndicator
                key={name}
                detail={regionDetail}
                passing={gates.region}
                onRemediate={onRemediate}
              />
            );
          }
          if (name === "lines") {
            return (
              <LinesIndicator
                key={name}
                detail={linesDetail}
                passing={gates.lines}
                onRemediate={onRemediate}
              />
            );
          }
          if (name === "permissions") {
            return (
              <PermissionsIndicator
                key={name}
                detail={permissionsDetail}
                passing={gates.permissions}
                onRemediate={onRemediate}
              />
            );
          }
          return (
            <GenericIndicator
              key={name}
              name={name}
              passing={gates[name]}
              onRemediate={onRemediate}
            />
          );
        })}
      </div>
      <div className="ml-auto">
        <button
          type="button"
          disabled={clearDisabled}
          onClick={onClearClick}
          className={
            clearDisabled
              ? "rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
              : "rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }
        >
          Clear
        </button>
      </div>
    </div>
  );
}
