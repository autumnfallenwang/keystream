"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ActionBar } from "@/components/action-bar";
import { CountdownOverlay } from "@/components/countdown-overlay";
import { MainHeader } from "@/components/main-header";
import { SettingsShell } from "@/components/settings-shell";
import { SettingsSidebar, type SettingsTab } from "@/components/settings-sidebar";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { type AppEvent, type AppState, isTextLocked, reduce } from "@/lib/core/app-state";
import { APPEARANCE_DEFAULT } from "@/lib/core/appearance";
import { allGatesPass, computeGates } from "@/lib/core/gates";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from "@/lib/core/sidebar-width";
import {
  checkPermissions,
  clearText,
  createSendChannel,
  getSettings,
  getText,
  log,
  logErr,
  logWarning,
  openSettingsPane,
  type Permissions,
  pauseSend,
  pickTextFile,
  readTextFile,
  runSend,
  type SendEvent,
  type Settings,
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

  const handleLoadFile = useCallback(() => {
    void (async () => {
      try {
        const picked = await pickTextFile();
        if (picked === null) return;
        const content = await readTextFile(picked.path);
        setText(content);
        setLocked(true);
        await log(`page: file_loaded name=${picked.name} bytes=${content.length}`);
      } catch (err) {
        void logErr(`page: load_file_failed: ${String(err)}`);
      }
    })();
  }, []);

  const handleClear = useCallback(() => {
    setText("");
    setLocked(false);
    void clearText().catch((err) => {
      void logWarning(`page: clear_text_failed: ${String(err)}`);
    });
    void log("page: clear_clicked");
  }, []);

  const handleToggleLocked = useCallback((next: boolean) => {
    setLocked(next);
    void log(`page: lock_toggled locked=${next}`);
  }, []);

  const handleTextGate = useCallback(() => {
    // No-op for now; the Edit/Lock switch is the action surface.
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
            onLoadFile={handleLoadFile}
            onClear={handleClear}
            clearDisabled={text.length === 0}
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
                textLoaded={text.length > 0}
                textCharCount={text.length}
                accessibilityGranted={permissions?.accessibility ?? false}
                locked={locked}
                totalChars={text.length}
                onTextGateClick={handleTextGate}
                onAccessibilityGateClick={handleAccessibilityGate}
                onToggleLocked={handleToggleLocked}
              />
              <TextPanel
                text={text}
                locked={locked}
                state={appState}
                onTextChange={setText}
                onLoadFile={handleLoadFile}
              />
              <ActionBar
                state={appState}
                canSend={canSend}
                totalChars={text.length}
                onSend={handleSend}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
              />
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
