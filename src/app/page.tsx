"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BinaryFileWarning } from "@/components/binary-file-warning";
import { CountdownOverlay } from "@/components/countdown-overlay";
import { MainHeader } from "@/components/main-header";
import { SettingsShell } from "@/components/settings-shell";
import { SettingsSidebar, type SettingsTab } from "@/components/settings-sidebar";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { type AppEvent, type AppState, isTextLocked, reduce } from "@/lib/core/app-state";
import { APPEARANCE_DEFAULT } from "@/lib/core/appearance";
import type { FolderTree } from "@/lib/core/file-tree";
import { toggleExpanded } from "@/lib/core/file-tree";
import { allGatesPass, computeGates } from "@/lib/core/gates";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from "@/lib/core/sidebar-width";
import {
  type AppStateCfg,
  checkPermissions,
  createSendChannel,
  getAppState,
  getSettings,
  getText,
  log,
  logErr,
  logWarning,
  openSettingsPane,
  type Permissions,
  pauseSend,
  pickFolder,
  pickTextFile,
  readFolderTree,
  readTextFile,
  runSend,
  type SendEvent,
  type Settings,
  saveAppState,
  saveSettings,
  saveText,
  stopSend,
} from "@/lib/ipc";

const APP_VERSION = "0.1.0";

const DEFAULT_SETTINGS: Settings = {
  eventPauseMs: 10,
  modHoldMs: 10,
  warmupShift: true,
  countdownSecs: 3,
  appearance: APPEARANCE_DEFAULT,
  sidebarWidthPx: SIDEBAR_WIDTH_DEFAULT,
};

const TextPanel = dynamic(() => import("@/components/text-panel").then((m) => m.TextPanel), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function Home() {
  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [appState, dispatch] = useReducer(
    (state: AppState, event: AppEvent) => reduce(state, event),
    { mode: "idle" } as AppState,
  );
  const sendInvokedRef = useRef(false);

  // Q18 — file-explorer state. `loadedFolder` is the parsed tree from
  // `read_folder_tree`; `selectedFile` is the absolute path of the file
  // currently shown in the text panel; `expandedPaths` tracks which
  // folders the user has open in the tree.
  const [loadedFolder, setLoadedFolder] = useState<FolderTree | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Q21 — soft-wrap toggle for the text panel. Per-session, defaults
  // off (matches Q16's `white-space: pre`).
  const [wrap, setWrap] = useState(false);

  // Q20 — when the user clicks a file that fails to read as UTF-8 (or
  // is over the 1 MiB cap), the main panel area swaps to a warning
  // view. Previous text/locked state stays untouched so the Back
  // button can restore them.
  const [binaryWarning, setBinaryWarning] = useState<{
    filename: string;
    reason: string;
  } | null>(null);

  // Mount: restore text + settings.
  useEffect(() => {
    void (async () => {
      try {
        const restored = await getText();
        if (restored !== null && restored.length > 0) {
          setText(restored);
          await log(`page: text_restored bytes=${restored.length}`);
        }
      } catch (err) {
        await logWarning(`page: get_text_failed: ${String(err)}`);
      }
      try {
        const cfg = await getSettings();
        setSettings(cfg);
        await log(
          `page: settings_loaded event_pause_ms=${cfg.eventPauseMs} mod_hold_ms=${cfg.modHoldMs}`,
        );
      } catch (err) {
        await logWarning(`page: get_settings_failed: ${String(err)}`);
      }
      // Q18 — restore explorer state. If the saved folder is gone
      // (deleted, moved, perms changed), quietly clear it from state
      // so a stale `lastFolder` doesn't keep erroring on every launch.
      try {
        const st = await getAppState();
        setExpandedPaths(new Set(st.expandedPaths));
        if (st.selectedFile !== null) setSelectedFile(st.selectedFile);
        if (st.lastFolder !== null) {
          try {
            const tree = await readFolderTree(st.lastFolder);
            setLoadedFolder(tree);
            await log(`page: folder_restored has_selection=${st.selectedFile !== null}`);
          } catch (e) {
            await logWarning(`page: folder_restore_failed: ${String(e)}`);
            void saveAppState({
              lastFolder: null,
              selectedFile: null,
              expandedPaths: st.expandedPaths,
            });
          }
        }
      } catch (err) {
        await logWarning(`page: get_state_failed: ${String(err)}`);
      }
    })();
  }, []);

  // Permission probe + visibilitychange re-probe.
  useEffect(() => {
    const probe = async () => {
      try {
        const p = await checkPermissions();
        setPermissions(p);
        await log(`page: permissions_check accessibility=${p.accessibility}`);
      } catch (err) {
        await logWarning(`page: permissions_check_failed: ${String(err)}`);
      }
    };
    void probe();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void probe();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Persist text on lock transitions.
  useEffect(() => {
    if (!locked) return;
    void (async () => {
      try {
        await saveText(text);
        await log(`page: text_saved bytes=${text.length}`);
      } catch (err) {
        await logWarning(`page: save_text_failed: ${String(err)}`);
      }
    })();
  }, [locked, text]);

  // Force-lock when sending/paused/countdown/done.
  useEffect(() => {
    if (isTextLocked(appState) && !locked) {
      setLocked(true);
    }
  }, [appState, locked]);

  // Countdown timer + fire transition.
  useEffect(() => {
    if (appState.mode !== "countdown") return;
    if (appState.remaining === 0) {
      const t = setTimeout(() => {
        dispatch({ kind: "countdownFire", nowMs: Date.now() });
      }, 250);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      dispatch({ kind: "countdownTick" });
      void log(`page: countdown_tick remaining=${appState.remaining - 1}`);
    }, 1000);
    return () => clearTimeout(t);
  }, [appState]);

  // Auto-clear "done" after 2.5s.
  useEffect(() => {
    if (appState.mode !== "done") return;
    const t = setTimeout(() => dispatch({ kind: "doneTimeout" }), 2500);
    return () => clearTimeout(t);
  }, [appState]);

  // IPC kick-off when state transitions to sending.
  useEffect(() => {
    if (appState.mode !== "sending") {
      sendInvokedRef.current = false;
      return;
    }
    if (sendInvokedRef.current) return;
    sendInvokedRef.current = true;

    const startOffset = appState.charsTyped;
    void (async () => {
      const channel = createSendChannel((event: SendEvent) => {
        switch (event.event) {
          case "sendProgress":
            dispatch({ kind: "ipcSendProgress", charsTyped: event.data.charsTyped });
            return;
          case "sendComplete":
            dispatch({
              kind: "ipcSendComplete",
              chars: event.data.charsTyped,
              skipped: event.data.skipped,
              durationMs: event.data.durationMs,
            });
            return;
          case "sendPaused":
            dispatch({
              kind: "ipcSendPaused",
              position: event.data.position,
              charsTyped: event.data.charsTyped,
              durationMs: event.data.durationMs,
            });
            return;
          case "sendStopped":
            dispatch({
              kind: "ipcSendStopped",
              position: event.data.position,
              charsTyped: event.data.charsTyped,
              durationMs: event.data.durationMs,
            });
        }
      });
      try {
        await log(`page: run_send_start chars=${text.length} start_offset=${startOffset}`);
        await runSend(text, settings, startOffset, channel);
      } catch (err) {
        void logErr(`page: run_send_failed: ${String(err)}`);
      }
    })();
  }, [appState, text, settings]);

  // Esc handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (appState.mode === "countdown") {
        e.preventDefault();
        dispatch({ kind: "countdownCancelled" });
        return;
      }
      if (appState.mode === "sending") {
        e.preventDefault();
        void log("page: pause_via_esc");
        void pauseSend().catch((err) => {
          void logErr(`page: pause_send_failed: ${String(err)}`);
        });
        return;
      }
      if (appState.mode === "paused") {
        e.preventDefault();
        void log("page: stop_via_esc");
        dispatch({ kind: "stopClicked" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appState]);

  const gates = computeGates({ text, locked, permissions });
  // Send is enabled in any "not actively running" state: idle, done
  // (after a complete send), or stopped (after Stop from sending or
  // paused). Mirrors the reducer's `sendClicked` accept-set in
  // `src/lib/core/app-state.ts` — keep these in sync.
  const canSend =
    allGatesPass(gates) &&
    (appState.mode === "idle" || appState.mode === "done" || appState.mode === "stopped");

  // Q21 — header derived values.
  const headerFilename =
    selectedFile === null ? null : (selectedFile.split(/[\\/]/).pop() ?? selectedFile);
  // Hover-tooltip reason for a disabled Send button. Order: missing
  // text > unlocked > missing accessibility. The accessibility case
  // also surfaces the inline warning row above the text panel.
  let sendDisabledReason: string | null = null;
  if (!canSend) {
    if (text.length === 0) sendDisabledReason = "Load text first.";
    else if (!locked) sendDisabledReason = "Lock the text to send.";
    else if (!(permissions?.accessibility ?? false))
      sendDisabledReason = "Grant Accessibility in System Settings.";
  }

  // Q18 — debounced explorer-state persistence. Mirrors settingsSaveRef
  // for the same UX shape: in-memory updates feel snappy; the disk
  // write is amortised over 300ms of activity.
  const stateSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistAppState = useCallback((next: AppStateCfg) => {
    if (stateSaveRef.current !== null) clearTimeout(stateSaveRef.current);
    stateSaveRef.current = setTimeout(() => {
      void saveAppState(next).catch((err) => {
        void logWarning(`page: save_state_failed: ${String(err)}`);
      });
    }, 300);
  }, []);

  const handleLoadFile = useCallback(() => {
    void (async () => {
      const picked = await pickTextFile();
      if (picked === null) return;
      // Always reflect the picked file in the explorer's single-file
      // row, even if the read fails. Clear any previously-loaded
      // folder so the explorer drops to single-file mode (otherwise
      // the tree keeps showing and hides this row).
      setLoadedFolder(null);
      setExpandedPaths(new Set());
      setSelectedFile(picked.path);
      try {
        const content = await readTextFile(picked.path);
        setText(content);
        setLocked(true);
        setBinaryWarning(null);
        // Persist the new state: no folder, this file selected.
        persistAppState({
          lastFolder: null,
          selectedFile: picked.path,
          expandedPaths: [],
        });
        await log(`page: file_loaded name=${picked.name} bytes=${content.length}`);
      } catch (err) {
        // Q20 — binary or oversized pick. Show the warning view; keep
        // the previously-loaded text untouched.
        setBinaryWarning({ filename: picked.name, reason: String(err) });
        persistAppState({
          lastFolder: null,
          selectedFile: picked.path,
          expandedPaths: [],
        });
        void logWarning(`page: load_file_failed name=${picked.name}`);
      }
    })();
  }, [persistAppState]);

  // Q18 — Open folder: pick → read tree → setLoadedFolder → persist.
  // Switching to a different folder clears the selection (the previously
  // selected file may not exist in the new tree).
  const handleOpenFolder = useCallback(() => {
    void (async () => {
      try {
        const path = await pickFolder();
        if (path === null) return;
        const tree = await readFolderTree(path);
        setLoadedFolder(tree);
        setSelectedFile(null);
        setExpandedPaths(new Set());
        persistAppState({
          lastFolder: path,
          selectedFile: null,
          expandedPaths: [],
        });
        await log(`page: folder_opened children=${tree.children.length}`);
      } catch (err) {
        void logErr(`page: open_folder_failed: ${String(err)}`);
      }
    })();
  }, [persistAppState]);

  // Q18 — Click a file in the tree. Loads the content, drops to edit
  // mode (Q18 invariant), saves the path. Gated on idle / done /
  // stopped so the user can't switch mid-send. If sending, ignore
  // silently (with a log).
  const handleSelectFile = useCallback(
    (path: string) => {
      const allowed =
        appState.mode === "idle" || appState.mode === "done" || appState.mode === "stopped";
      if (!allowed) {
        void logWarning(`page: select_file_blocked mode=${appState.mode}`);
        return;
      }
      void (async () => {
        try {
          const content = await readTextFile(path);
          setText(content);
          setLocked(false);
          setSelectedFile(path);
          setBinaryWarning(null);
          // Persist the selection alongside the current folder state.
          persistAppState({
            lastFolder: loadedFolder?.rootPath ?? null,
            selectedFile: path,
            expandedPaths: Array.from(expandedPaths),
          });
          // Mirror to text.txt so a later launch without the explorer
          // (e.g. the user closed the folder) still surfaces the same
          // text in the editor.
          void saveText(content).catch((err) => {
            void logWarning(`page: save_text_failed: ${String(err)}`);
          });
          await log(`page: file_selected bytes=${content.length}`);
        } catch (err) {
          // Q20 — read failure (UTF-8 / size cap / IO). Don't overwrite
          // the loaded text; surface a warning view in the main panel
          // and let the user click Back to dismiss. Mark the row as
          // selected so the user sees which file the warning refers to.
          const filename = path.split(/[\\/]/).pop() ?? path;
          setSelectedFile(path);
          setBinaryWarning({ filename, reason: String(err) });
          void logWarning(`page: select_file_failed name=${filename}`);
        }
      })();
    },
    [appState, loadedFolder, expandedPaths, persistAppState],
  );

  // Q20 — dismiss the binary-file warning and restore the previous
  // text panel state. The text/locked state never changed, so this is
  // just clearing the warning.
  const handleBinaryWarningBack = useCallback(() => {
    setBinaryWarning(null);
  }, []);

  // Q21 — wrap toggle. Per-session, no persistence.
  const handleToggleWrap = useCallback(() => {
    setWrap((prev) => !prev);
  }, []);

  const handleToggleFolder = useCallback(
    (path: string) => {
      setExpandedPaths((prev) => {
        const next = toggleExpanded(prev, path);
        persistAppState({
          lastFolder: loadedFolder?.rootPath ?? null,
          selectedFile,
          expandedPaths: Array.from(next),
        });
        return next;
      });
    },
    [loadedFolder, selectedFile, persistAppState],
  );

  const handleToggleLocked = useCallback((next: boolean) => {
    setLocked(next);
    void log(`page: lock_toggled locked=${next}`);
  }, []);

  const handleAccessibilityGate = useCallback(() => {
    void openSettingsPane("accessibility").catch((err) => {
      void logWarning(`page: open_settings_pane_failed: ${String(err)}`);
    });
  }, []);

  const handleSend = useCallback(() => {
    void log(`page: send_clicked chars=${text.length} countdown_secs=${settings.countdownSecs}`);
    dispatch({
      kind: "sendClicked",
      totalChars: text.length,
      countdownSecs: settings.countdownSecs,
    });
  }, [text, settings.countdownSecs]);

  const handlePause = useCallback(() => {
    void log("page: pause_clicked");
    void pauseSend().catch((err) => {
      void logErr(`page: pause_send_failed: ${String(err)}`);
    });
  }, []);

  const handleResume = useCallback(() => {
    void log(`page: resume_clicked countdown_secs=${settings.countdownSecs}`);
    dispatch({ kind: "resumeClicked", countdownSecs: settings.countdownSecs });
  }, [settings.countdownSecs]);

  const handleStop = useCallback(() => {
    void log("page: stop_clicked");
    if (appState.mode === "sending") {
      void stopSend().catch((err) => {
        void logErr(`page: stop_send_failed: ${String(err)}`);
      });
      return;
    }
    dispatch({ kind: "stopClicked" });
  }, [appState]);

  const handleOpenSettings = useCallback(() => {
    setSettingsTab("appearance");
    dispatch({ kind: "openSettings" });
  }, []);

  const handleCloseSettings = useCallback(() => {
    dispatch({ kind: "closeSettings" });
  }, []);

  // Debounced settings save.
  const settingsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSettingsChange = useCallback((next: Settings) => {
    setSettings(next);
    if (settingsSaveRef.current !== null) clearTimeout(settingsSaveRef.current);
    settingsSaveRef.current = setTimeout(() => {
      void saveSettings(next).catch((err) => {
        void logWarning(`page: save_settings_failed: ${String(err)}`);
      });
    }, 300);
  }, []);

  const handleSettingsReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    // Q19: also reset --sidebar-width directly so the visual snaps
    // immediately, before the next ThemeProvider re-render.
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${DEFAULT_SETTINGS.sidebarWidthPx}px`,
    );
    void saveSettings(DEFAULT_SETTINGS).catch((err) => {
      void logWarning(`page: save_settings_failed: ${String(err)}`);
    });
  }, []);

  // Q19: live update during sidebar drag — write directly to the CSS
  // var on documentElement, bypassing React re-renders for 60fps
  // smoothness. No state update yet.
  const handleSidebarResize = useCallback((px: number) => {
    document.documentElement.style.setProperty("--sidebar-width", `${px}px`);
  }, []);

  // Q19: commit on mouseup or double-click — clamp, update state,
  // immediately re-apply the CSS var (the React re-render of
  // ThemeProvider would do this too, but doing it here avoids any
  // brief visual glitch), and persist via the existing debounce.
  const handleSidebarCommit = useCallback(
    (px: number) => {
      const clamped = clampSidebarWidth(px);
      const next = { ...settings, sidebarWidthPx: clamped };
      setSettings(next);
      document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
      if (settingsSaveRef.current !== null) clearTimeout(settingsSaveRef.current);
      settingsSaveRef.current = setTimeout(() => {
        void saveSettings(next).catch((err) => {
          void logWarning(`page: save_settings_failed: ${String(err)}`);
        });
      }, 300);
    },
    [settings],
  );

  const handleCountdownCancel = useCallback(() => {
    dispatch({ kind: "countdownCancelled" });
  }, []);

  const inSettings = appState.mode === "settings";
  const showCountdown = appState.mode === "countdown";

  return (
    <>
      <ThemeProvider appearance={settings.appearance} sidebarWidthPx={settings.sidebarWidthPx} />
      <div className="flex h-screen bg-canvas text-fg">
        {inSettings ? (
          <SettingsSidebar
            activeTab={settingsTab}
            onTabChange={setSettingsTab}
            onBack={handleCloseSettings}
            appVersion={APP_VERSION}
            onResize={handleSidebarResize}
            onResizeCommit={handleSidebarCommit}
            currentWidthPx={settings.sidebarWidthPx}
          />
        ) : (
          <Sidebar
            tree={loadedFolder}
            selectedPath={selectedFile}
            expandedPaths={expandedPaths}
            onOpenFile={handleLoadFile}
            onOpenFolder={handleOpenFolder}
            onSelectFile={handleSelectFile}
            onToggleFolder={handleToggleFolder}
            onOpenSettings={handleOpenSettings}
            inSettings={inSettings}
            appVersion={APP_VERSION}
            onResize={handleSidebarResize}
            onResizeCommit={handleSidebarCommit}
            currentWidthPx={settings.sidebarWidthPx}
          />
        )}
        <main className="flex flex-1 flex-col overflow-hidden">
          {inSettings ? (
            <SettingsShell
              settings={settings}
              onChange={handleSettingsChange}
              onReset={handleSettingsReset}
              activeTab={settingsTab}
            />
          ) : (
            <>
              <MainHeader
                state={appState}
                filename={headerFilename}
                locked={locked}
                totalChars={text.length}
                wrap={wrap}
                canSend={canSend}
                sendDisabledReason={sendDisabledReason}
                onToggleLocked={handleToggleLocked}
                onToggleWrap={handleToggleWrap}
                onSend={handleSend}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
              />
              {!(permissions?.accessibility ?? true) && (
                <button
                  type="button"
                  onClick={handleAccessibilityGate}
                  className="flex shrink-0 items-center justify-center gap-2 border-b border-warn/30 bg-warn/5 px-4 py-2 text-[12px] text-warn transition-colors hover:bg-warn/10"
                  data-testid="accessibility-warning-row"
                >
                  <span>
                    Accessibility permission is not granted — click to open System Settings.
                  </span>
                </button>
              )}
              {binaryWarning === null ? (
                <TextPanel
                  text={text}
                  locked={locked}
                  state={appState}
                  wrap={wrap}
                  onTextChange={setText}
                  onLoadFile={handleLoadFile}
                />
              ) : (
                <BinaryFileWarning
                  filename={binaryWarning.filename}
                  reason={binaryWarning.reason}
                  onBack={handleBinaryWarningBack}
                />
              )}
            </>
          )}
        </main>
        {showCountdown && (
          <CountdownOverlay
            remaining={appState.remaining}
            totalSecs={settings.countdownSecs}
            onCancel={handleCountdownCancel}
          />
        )}
      </div>
    </>
  );
}
