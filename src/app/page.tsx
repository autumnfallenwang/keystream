"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "@/components/controls";
import {
  COUNTDOWN_SECS,
  CountdownOverlay,
  type CountdownState,
} from "@/components/countdown-overlay";
import { StatusStrip } from "@/components/status-strip";
import { type ChunkState, chunkText } from "@/lib/core/chunks";
import {
  allGatesPass,
  computeGates,
  failingGateCount,
  type GateName,
  type Permissions,
  type Region,
} from "@/lib/core/gates";
import { computeProgressText, type SendCompletePayload } from "@/lib/core/progress";
import { dispatchSendEvent } from "@/lib/core/send-dispatcher";
import {
  type CheckLinesResult,
  type ContinueAction,
  calibrate,
  checkLines,
  checkPermissions,
  clearRegion,
  clearText,
  continueAfterFail,
  createSendChannel,
  type DiffLine,
  type DiffStats,
  getRegion,
  getText,
  log,
  logErr,
  logWarning,
  openSettingsPane,
  type SendEvent,
  type SettingsPane,
  saveText,
  sendWithChunkedVerify,
  stopSend,
} from "@/lib/ipc";

const TextPanel = dynamic(() => import("@/components/text-panel").then((m) => m.TextPanel), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function Home() {
  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);

  // Task 42: macOS permission state. Polled on mount + visibilitychange +
  // explicit click. Drawer state is local to the strip's UI.
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [permissionsExpanded, setPermissionsExpanded] = useState(false);

  // Task 36: line-length pre-check state.
  const [lineCheck, setLineCheck] = useState<CheckLinesResult | null>(null);
  const [linesExpanded, setLinesExpanded] = useState(false);
  const [_lineCheckRunning, setLineCheckRunning] = useState(false);

  // Task 35: region state.
  const [region, setRegion] = useState<Region | null>(null);
  const [regionCalibrating, setRegionCalibrating] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);

  // Task 37: chunk state. Tasks 39/40 will mutate via send events.
  const [chunkStates, setChunkStates] = useState<ChunkState[]>([]);
  const [expandedFailChunks, setExpandedFailChunks] = useState<Set<number>>(new Set());

  // Task 38: pre-send countdown overlay. Task 39 wires the actual
  // send_with_chunked_verify invoke when remaining hits 0.
  const [countdownState, setCountdownState] = useState<CountdownState | null>(null);

  // Task 39: live send-progress state. Channel events drive these.
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState<SendCompletePayload | null>(null);
  const [chunkFailDiffs, setChunkFailDiffs] = useState<
    Map<number, { stats: DiffStats; diff: DiffLine[] }>
  >(new Map());
  // Task 40: which chunk index is awaiting an ack (Skip/Stop/Continue)?
  // null = no chunk awaiting (idle, in-flight passing, or already acked).
  const [awaitingAck, setAwaitingAck] = useState<number | null>(null);
  // Task 41: 0-indexed chunk where Stop landed; null when not stopped.
  const [sendCancelledAt, setSendCancelledAt] = useState<number | null>(null);
  // Strict-mode dev double-mount guard for the IPC kick-off effect.
  const sendInvokedRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore saved region on mount.
  useEffect(() => {
    void (async () => {
      try {
        const restored = await getRegion();
        if (restored !== null) {
          setRegion(restored);
          await log(
            `page: region_restored x=${restored.x} y=${restored.y} w=${restored.w} h=${restored.h}`,
          );
        }
      } catch (err) {
        await logWarning(`page: get_region_failed: ${String(err)}`);
      }
    })();
  }, []);

  // Task 43: restore saved text on mount. Always lands editable so the user
  // can review/edit before re-Submitting; we deliberately don't persist
  // `locked`.
  useEffect(() => {
    void (async () => {
      try {
        const restored = await getText();
        if (restored !== null && restored.length > 0) {
          setText(restored);
          await log(
            `page: text_restored bytes=${restored.length} lines=${restored.split("\n").length}`,
          );
        }
      } catch (err) {
        await logWarning(`page: get_text_failed: ${String(err)}`);
      }
    })();
  }, []);

  // Task 43: persist text on every locked-true transition. Submit (manual
  // lock) and successful file-load both flip locked → true and trigger this.
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

  // Task 42: probe permissions on mount + every time the document becomes
  // visible (user cmd-tabs back from System Settings, etc.).
  useEffect(() => {
    const probe = async () => {
      try {
        await log("page: permissions_check_started");
        const p = await checkPermissions();
        setPermissions(p);
        await log(
          `page: permissions_check_completed accessibility=${p.accessibility} screenRecording=${p.screenRecording}`,
        );
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

  // Run check_lines when text becomes locked. Clears on unlock.
  useEffect(() => {
    if (!locked) {
      setLineCheck(null);
      setLinesExpanded(false);
      return;
    }
    let cancelled = false;
    setLineCheckRunning(true);
    void (async () => {
      try {
        await log(`page: line_check_started chars=${text.length} lines=${text.split("\n").length}`);
        const result = await checkLines(text);
        if (cancelled) return;
        setLineCheck(result);
        await log(
          `page: line_check_completed ok=${result.ok} offending=${result.offending.length}`,
        );
      } catch (err) {
        if (cancelled) return;
        await logWarning(`page: line_check_failed: ${String(err)}`);
        setLineCheck({ ok: false, offending: [] });
      } finally {
        if (!cancelled) setLineCheckRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text, locked]);

  const offendingLines = useMemo(
    () => new Set(lineCheck?.offending.map((o) => o.line) ?? []),
    [lineCheck],
  );

  const chunks = useMemo(() => (locked ? chunkText(text) : []), [text, locked]);

  // Reset chunk state on lock/unlock transition.
  useEffect(() => {
    if (locked) {
      const next = chunks.map<ChunkState>(() => "untouched");
      setChunkStates(next);
      setExpandedFailChunks(new Set());
      void log(`page: chunk_states_initialized count=${next.length}`);
    } else {
      setChunkStates([]);
      setExpandedFailChunks(new Set());
    }
    // chunks is derived from text+locked; re-run only when locked transitions
    // or text content changes while locked (file load mid-locked is unusual
    // but the same shape is correct).
  }, [locked, chunks]);

  const handleChunkClick = (idx: number) => {
    const state = chunkStates[idx];
    if (state !== "fail") return;
    let nextExpanded = false;
    setExpandedFailChunks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        nextExpanded = false;
      } else {
        next.add(idx);
        nextExpanded = true;
      }
      return next;
    });
    void log(`page: fail_chunk_expanded idx=${idx} expanded=${nextExpanded}`);
  };

  // Task 38: countdown timer. One setTimeout per render — naturally
  // cancellable when countdownState flips to null. Task 39: when
  // remaining hits 0, the timer stops; the IPC kick-off effect below
  // fires send_with_chunked_verify and the first chunkStart event
  // dismisses the overlay.
  useEffect(() => {
    if (countdownState === null) return;
    if (countdownState.remaining === 0) return; // overlay stays at "GO"; IPC effect handles
    const t = setTimeout(() => {
      setCountdownState((s) => {
        if (s === null) return null;
        if (s.remaining > 0) {
          void log(`page: countdown_tick remaining=${s.remaining - 1}`);
          return { remaining: s.remaining - 1 };
        }
        return s;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [countdownState]);

  // Task 38 + 41: Esc cancels the countdown OR stops an in-flight send
  // (or both during the brief countdown→sending overlap). Listener mounts
  // only while either is true.
  useEffect(() => {
    const overlayVisible = countdownState !== null;
    if (!overlayVisible && !sending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (overlayVisible) {
        setCountdownState(null);
        void log("page: countdown_cancelled_by_escape");
      }
      if (sending) {
        void log("page: stop_via_esc");
        void stopSend().catch((err) => {
          void logErr(`page: stop_send_failed: ${String(err)}`);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [countdownState, sending]);

  const handleSend = () => {
    sendInvokedRef.current = false;
    setSendSummary(null);
    setChunkFailDiffs(new Map());
    setSendCancelledAt(null);
    setCountdownState({ remaining: COUNTDOWN_SECS });
    void log(`page: send_clicked countdown_started seconds=${COUNTDOWN_SECS}`);
  };

  const handleCountdownCancel = () => {
    setCountdownState(null);
    void log("page: countdown_cancelled_by_button");
  };

  const handleStop = () => {
    void log("page: stop_clicked");
    void stopSend().catch((err) => {
      void logErr(`page: stop_send_failed: ${String(err)}`);
    });
  };

  const handleAck = (action: ContinueAction) => {
    const idx = awaitingAck;
    setAwaitingAck(null);
    void log(`page: ack_clicked action=${action} idx=${idx ?? -1}`);
    void continueAfterFail(action).catch((err) => {
      void logWarning(`page: ack_failed: ${String(err)}`);
    });
  };

  // Task 39 + 46: SendEvent dispatcher. Pure logic lives in
  // src/lib/core/send-dispatcher.ts (testable in isolation); this wrapper
  // gathers React state, runs the reducer, spreads the result back to the
  // setters, and handles the impure side effects.
  const handleSendEvent = (event: SendEvent) => {
    const next = dispatchSendEvent(
      {
        chunkStates,
        chunkFailDiffs,
        awaitingAck,
        sendSummary,
        sendCancelledAt,
        sending,
        expandedFailChunks,
      },
      event,
    );
    setChunkStates(next.chunkStates);
    setChunkFailDiffs(next.chunkFailDiffs);
    setAwaitingAck(next.awaitingAck);
    setSendSummary(next.sendSummary);
    setSendCancelledAt(next.sendCancelledAt);
    setSending(next.sending);
    setExpandedFailChunks(next.expandedFailChunks);

    // Impure side effects.
    switch (event.event) {
      case "chunkStart": {
        const { index, total } = event.data;
        setCountdownState(null);
        if (chunkStates.length !== total) {
          void logWarning(
            `page: chunk_states_resized prev=${chunkStates.length} backend_total=${total}`,
          );
        }
        void log(`page: send_event event=chunkStart index=${index} total=${total}`);
        return;
      }
      case "chunkPass":
        void log(`page: send_event event=chunkPass index=${event.data.index}`);
        return;
      case "chunkFail":
        void log(
          `page: chunk_fail_received idx=${event.data.index} char_diffs=${event.data.stats.charDiffs} expanding_for_ack=true`,
        );
        return;
      case "sendComplete": {
        const { total, passed, failed, skipped } = event.data;
        sendInvokedRef.current = false;
        void log(
          `page: send_event event=sendComplete total=${total} passed=${passed} failed=${failed} skipped=${skipped}`,
        );
        return;
      }
      case "sendCancelled":
        sendInvokedRef.current = false;
        void log(
          `page: send_cancelled stopped_idx=${next.sendCancelledAt} at_chunk=${event.data.atChunk}`,
        );
        return;
    }
  };

  // Task 39: kick off IPC when the countdown reaches "GO" (remaining = 0).
  // Strict-mode dev double-mount guard via sendInvokedRef. Other refs
  // (text, chunkStates, handleSendEvent) are intentionally NOT in the
  // deps — re-firing IPC on every text edit would be catastrophic; we
  // only want this effect to react to the countdown reaching 0.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (countdownState?.remaining !== 0) return;
    if (sendInvokedRef.current) return;
    sendInvokedRef.current = true;
    setSending(true);
    void (async () => {
      try {
        await log(`page: send_invoke_started chars=${text.length} chunks=${chunkStates.length}`);
        const channel = createSendChannel(handleSendEvent);
        await sendWithChunkedVerify(text, channel);
      } catch (err) {
        void logErr(`page: send_failed: ${String(err)}`);
        setSending(false);
        setCountdownState(null);
        sendInvokedRef.current = false;
      }
    })();
  }, [countdownState?.remaining]);

  // Task 39: auto-scroll the in-progress chunk into view. `block: "nearest"`
  // is a no-op when the element is already visible — matching the spec's
  // "only when in-progress chunk is about to leave view."
  useEffect(() => {
    const idx = chunkStates.indexOf("inProgress");
    if (idx < 0) return;
    const el = document.getElementById(`chunk-${idx}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chunkStates]);

  // Task 39: clear send-progress state on unlock so a fresh edit→submit
  // cycle starts clean. Task 40 also clears the awaitingAck flag.
  // Task 41 also clears sendCancelledAt.
  useEffect(() => {
    if (!locked) {
      setSending(false);
      setSendSummary(null);
      setChunkFailDiffs(new Map());
      setAwaitingAck(null);
      setSendCancelledAt(null);
      sendInvokedRef.current = false;
    }
  }, [locked]);

  const gates = computeGates({
    text,
    locked,
    lineCheckOk: lineCheck === null ? null : lineCheck.ok,
    region,
    permissions,
  });
  const allGatesOk = allGatesPass(gates);
  const failingCount = failingGateCount(gates);
  const fallbackStatus = allGatesOk
    ? "Ready to send"
    : `Waiting on ${failingCount} gate${failingCount === 1 ? "" : "(s)"}`;
  const statusText = computeProgressText({
    chunkStates,
    sending,
    sendSummary,
    sendCancelledAt,
    fallback: fallbackStatus,
  });
  // Send is disabled if gates fail OR a send is currently in flight.
  const sendDisabled = !allGatesOk || sending || countdownState !== null;

  const handleRemediate = (name: GateName) => {
    if (name !== "region" && name !== "lines" && gates[name]) return; // ✓ → no-op
    void (async () => {
      switch (name) {
        case "text":
          if (locked) {
            setLocked(false);
            await log("page: text_unlocked_for_remediation");
          }
          await log("page: gate_clicked name=text");
          textareaRef.current?.focus();
          return;
        case "lines":
          // Toggle drawer.
          setLinesExpanded((prev) => !prev);
          await log(`page: gate_clicked name=lines expanded=${!linesExpanded}`);
          return;
        case "region":
          if (regionCalibrating) {
            await log("page: calibrate_already_in_flight");
            return;
          }
          setRegionCalibrating(true);
          setRegionError(null);
          await log("page: calibrate_started");
          try {
            const r = await calibrate();
            setRegion(r);
            await log(`page: calibrate_completed x=${r.x} y=${r.y} w=${r.w} h=${r.h}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setRegionError(msg);
            await logWarning(`page: calibrate_failed: ${msg}`);
          } finally {
            setRegionCalibrating(false);
          }
          return;
        case "permissions": {
          // Refresh + open the drawer. The drawer's "Open System Settings"
          // buttons go through openSettingsPane.
          setPermissionsExpanded(true);
          await log("page: permissions_drawer_toggled expanded=true");
          try {
            const p = await checkPermissions();
            setPermissions(p);
            await log(
              `page: permissions_check_completed accessibility=${p.accessibility} screenRecording=${p.screenRecording}`,
            );
          } catch (err) {
            await logWarning(`page: permissions_check_failed: ${String(err)}`);
          }
          return;
        }
      }
    })();
  };

  const showLinesDrawer =
    lineCheck !== null && !lineCheck.ok && linesExpanded && lineCheck.offending.length > 0;

  const handleOpenSettings = (pane: SettingsPane) => {
    void log(`page: open_settings_pane pane=${pane}`);
    void openSettingsPane(pane).catch((err) => {
      void logWarning(`page: open_settings_pane_failed: ${String(err)}`);
    });
  };

  const clearDisabled = text.length === 0 && region === null;
  const handleClear = () => {
    void log("page: clear_clicked");
    setText("");
    setLocked(false);
    setRegion(null);
    setRegionError(null);
    setLineCheck(null);
    setLinesExpanded(false);
    setPermissionsExpanded(false);
    setSendSummary(null);
    setSendCancelledAt(null);
    setChunkFailDiffs(new Map());
    setAwaitingAck(null);
    void clearText().catch((err) => {
      void logWarning(`page: clear_text_failed: ${String(err)}`);
    });
    void clearRegion().catch((err) => {
      void logWarning(`page: clear_region_failed: ${String(err)}`);
    });
  };

  return (
    <main className="flex flex-1 flex-col">
      <StatusStrip
        gates={gates}
        onRemediate={handleRemediate}
        regionDetail={{
          calibrating: regionCalibrating,
          error: regionError,
          region,
        }}
        linesDetail={{
          result: lineCheck,
          expanded: linesExpanded,
          onToggleExpanded: () => setLinesExpanded((prev) => !prev),
        }}
        permissionsDetail={{
          permissions,
          expanded: permissionsExpanded,
          onToggleExpanded: () => setPermissionsExpanded((prev) => !prev),
        }}
        clearDisabled={clearDisabled}
        onClearClick={handleClear}
      />
      {showLinesDrawer && (
        <div className="shrink-0 max-h-40 overflow-auto px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-mono">
          {lineCheck?.offending.map((o) => (
            <div key={o.line} className="py-0.5 text-zinc-700 dark:text-zinc-300">
              Line {o.line}: {o.length} chars
            </div>
          ))}
        </div>
      )}
      {permissionsExpanded && (
        <div className="shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-amber-50 dark:bg-amber-950/40 text-xs">
          <PermissionRow
            label="Accessibility"
            description="Required to post keystrokes via CGEvent."
            granted={permissions?.accessibility ?? false}
            pane="accessibility"
            onOpenSettings={handleOpenSettings}
          />
          <PermissionRow
            label="Screen Recording"
            description="Required to capture the calibrated region for OCR verify."
            granted={permissions?.screenRecording ?? false}
            pane="screenRecording"
            onOpenSettings={handleOpenSettings}
          />
        </div>
      )}
      <TextPanel
        text={text}
        locked={locked}
        onTextChange={setText}
        onLock={() => setLocked(true)}
        onUnlock={() => setLocked(false)}
        textareaRef={textareaRef}
        offendingLines={offendingLines}
        chunks={chunks}
        chunkStates={chunkStates}
        expandedFailChunks={expandedFailChunks}
        onChunkClick={handleChunkClick}
        chunkFailDiffs={chunkFailDiffs}
        awaitingAck={awaitingAck}
        onAck={handleAck}
      />
      <Controls
        sendDisabled={sendDisabled}
        statusText={statusText}
        onSendClick={handleSend}
        stopDisabled={!sending}
        onStopClick={handleStop}
      />
      <CountdownOverlay state={countdownState} onCancel={handleCountdownCancel} />
    </main>
  );
}

function PermissionRow({
  label,
  description,
  granted,
  pane,
  onOpenSettings,
}: {
  label: string;
  description: string;
  granted: boolean;
  pane: SettingsPane;
  onOpenSettings: (pane: SettingsPane) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2">
        <span
          className={
            granted
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-red-600 dark:text-red-400 font-medium"
          }
        >
          {granted ? "✓" : "✗"} {label}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">— {description}</span>
      </div>
      {!granted && (
        <button
          type="button"
          className="rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => onOpenSettings(pane)}
        >
          Open System Settings
        </button>
      )}
    </div>
  );
}
