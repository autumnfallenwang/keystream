"use client";

// D-14 / Q22 — About + updater settings tab. Pattern borrowed from
// teacherease-parent-companion's settings-advanced.tsx. Auto-checks
// once every 24 hours when the tab is opened; manual "Check now"
// available. Updates download → signature-verify → install + relaunch
// in one click via tauri-plugin-updater.
//
// Updater errors that mean "no published release yet" surface as
// "up to date" instead of red text — the updater endpoint 404s
// until the first release is published.

import { CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  checkForUpdate,
  getAppVersion,
  installUpdate,
  log,
  logErr,
  type UpdateInfo,
} from "@/lib/ipc";
import { SettingsSection } from "./section-primitives";

const REPO_URL = "https://github.com/autumnfallenwang/keystream";

function isNoReleaseYetError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("did not respond with a successful status code") ||
    m.includes("could not fetch a valid release json") ||
    m.includes("404") ||
    m.includes("not found")
  );
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: UpdateInfo }
  | { kind: "error"; message: string };

export function AboutSection() {
  const [appVersion, setAppVersion] = useState<string>("…");
  const [checkState, setCheckState] = useState<CheckState>({ kind: "idle" });
  const [installing, setInstalling] = useState(false);

  const runCheck = useCallback(async (manual: boolean) => {
    setCheckState({ kind: "checking" });
    try {
      const result = await checkForUpdate();
      if (result === null) {
        if (manual) await log("updater: manual check — up to date");
        setCheckState({ kind: "up-to-date" });
      } else {
        await log(`updater: update available version=${result.version}`);
        setCheckState({ kind: "available", update: result });
      }
    } catch (e) {
      const msg = describeError(e);
      await logErr(`updater: check failed: ${msg}`);
      if (isNoReleaseYetError(msg)) {
        setCheckState({ kind: "up-to-date" });
      } else {
        setCheckState({ kind: "error", message: msg });
      }
    }
  }, []);

  useEffect(() => {
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("unknown"));
    // Auto-check once on tab open. teacherease throttles to 24h via a
    // persisted timestamp; we don't yet — the manual + auto-on-mount
    // surface area is small enough to not need it.
    void runCheck(false);
  }, [runCheck]);

  const handleInstall = async () => {
    if (checkState.kind !== "available") return;
    setInstalling(true);
    try {
      await log(`updater: installing version=${checkState.update.version}`);
      await installUpdate();
      // relaunch happens inside installUpdate — this only runs if it throws.
    } catch (e) {
      const msg = describeError(e);
      await logErr(`updater: install failed: ${msg}`);
      setCheckState({ kind: "error", message: `Install failed: ${msg}` });
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Version"
        help="The installed version of Keystream. Updates are checked once when this tab opens, or any time you click 'Check now'."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">Current version</p>
              <p className="font-mono text-[12px] text-fg-tertiary">v{appVersion}</p>
            </div>
            <button
              type="button"
              disabled={checkState.kind === "checking" || installing}
              onClick={() => {
                void runCheck(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-elevated px-3 text-[12px] text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkState.kind === "checking" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {checkState.kind === "checking" ? "Checking…" : "Check now"}
            </button>
          </div>

          {checkState.kind === "available" && (
            <div
              className="rounded-md border border-accent/30 bg-accent/5 p-3"
              data-testid="update-available"
            >
              <div className="flex items-start gap-3">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">
                    Version {checkState.update.version} available
                  </p>
                  <a
                    href={`${REPO_URL}/releases/tag/v${checkState.update.version}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-[12px] text-fg-tertiary underline-offset-4 hover:text-fg-secondary hover:underline"
                  >
                    Release notes →
                  </a>
                </div>
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => {
                    void handleInstall();
                  }}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {installing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Installing…
                    </>
                  ) : (
                    "Install"
                  )}
                </button>
              </div>
            </div>
          )}

          {checkState.kind === "up-to-date" && (
            <p
              className="flex items-center gap-1.5 text-[12px] text-ok"
              data-testid="update-up-to-date"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> You're on the latest version.
            </p>
          )}

          {checkState.kind === "error" && (
            <p className="text-[12px] text-alert" data-testid="update-error">
              Check failed: {checkState.message}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Source">
        <div className="space-y-1.5">
          <p className="text-[13px] text-fg-secondary">View the source code on GitHub.</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[12px] text-accent underline-offset-4 hover:underline"
          >
            {REPO_URL}
          </a>
        </div>
      </SettingsSection>
    </div>
  );
}
