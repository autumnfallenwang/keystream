import { describe, expect, it } from "vitest";
import { type AppState, COUNTDOWN_SECS, reduce } from "./app-state";

describe("reduce", () => {
  it("idle → countdown(send) on sendClicked uses payload countdownSecs", () => {
    const next = reduce(
      { mode: "idle" },
      { kind: "sendClicked", totalChars: 100, countdownSecs: 5 },
    );
    expect(next.mode).toBe("countdown");
    if (next.mode === "countdown") {
      expect(next.remaining).toBe(5);
      expect(next.intent).toBe("send");
      expect(next.resumeOffset).toBe(0);
    }
  });

  it("sendClicked respects the user's configured countdownSecs (e.g. 10)", () => {
    // Regression: the reducer used to hardcode COUNTDOWN_SECS=3 instead
    // of reading the per-event payload, so user settings were ignored.
    const next = reduce(
      { mode: "idle" },
      { kind: "sendClicked", totalChars: 100, countdownSecs: 10 },
    );
    expect(next.mode).toBe("countdown");
    if (next.mode === "countdown") {
      expect(next.remaining).toBe(10);
    }
  });

  it("resumeClicked respects the user's configured countdownSecs", () => {
    const start: AppState = {
      mode: "paused",
      position: 50,
      charsTyped: 50,
      totalChars: 200,
      durationMs: 1_000,
    };
    const next = reduce(start, { kind: "resumeClicked", countdownSecs: 7 });
    expect(next.mode).toBe("countdown");
    if (next.mode === "countdown") {
      expect(next.remaining).toBe(7);
      expect(next.intent).toBe("resume");
      expect(next.resumeOffset).toBe(50);
    }
  });

  it("countdownTick decrements while remaining > 0", () => {
    const start: AppState = {
      mode: "countdown",
      remaining: 3,
      intent: "send",
      resumeOffset: 0,
    };
    const next = reduce(start, { kind: "countdownTick" });
    expect(next.mode).toBe("countdown");
    if (next.mode === "countdown") {
      expect(next.remaining).toBe(2);
    }
  });

  it("countdownTick is a no-op when remaining=0", () => {
    const start: AppState = {
      mode: "countdown",
      remaining: 0,
      intent: "send",
      resumeOffset: 0,
    };
    const next = reduce(start, { kind: "countdownTick" });
    expect(next).toEqual(start);
  });

  it("countdownFire transitions to sending starting at resumeOffset", () => {
    const start: AppState = {
      mode: "countdown",
      remaining: 0,
      intent: "resume",
      resumeOffset: 50,
    };
    const next = reduce(start, { kind: "countdownFire", nowMs: 1_000 });
    expect(next.mode).toBe("sending");
    if (next.mode === "sending") {
      expect(next.charsTyped).toBe(50);
      expect(next.startedAtMs).toBe(1_000);
    }
  });

  it("countdownCancelled returns to idle", () => {
    const start: AppState = {
      mode: "countdown",
      remaining: 2,
      intent: "send",
      resumeOffset: 0,
    };
    const next = reduce(start, { kind: "countdownCancelled" });
    expect(next.mode).toBe("idle");
  });

  it("sending → done on ipcSendComplete", () => {
    const start: AppState = {
      mode: "sending",
      charsTyped: 0,
      totalChars: 100,
      startedAtMs: 0,
    };
    const next = reduce(start, {
      kind: "ipcSendComplete",
      chars: 100,
      skipped: 2,
      durationMs: 4_000,
    });
    expect(next.mode).toBe("done");
    if (next.mode === "done") {
      expect(next.chars).toBe(100);
      expect(next.skipped).toBe(2);
      expect(next.durationMs).toBe(4_000);
    }
  });

  it("sending → paused on ipcSendPaused preserves position", () => {
    const start: AppState = {
      mode: "sending",
      charsTyped: 0,
      totalChars: 100,
      startedAtMs: 0,
    };
    const next = reduce(start, {
      kind: "ipcSendPaused",
      position: 42,
      charsTyped: 40,
      durationMs: 1_000,
    });
    expect(next.mode).toBe("paused");
    if (next.mode === "paused") {
      expect(next.position).toBe(42);
      expect(next.charsTyped).toBe(40);
      expect(next.totalChars).toBe(100);
    }
  });

  it("paused → countdown(resume) carries position as resumeOffset", () => {
    const start: AppState = {
      mode: "paused",
      position: 42,
      charsTyped: 40,
      totalChars: 100,
      durationMs: 1_000,
    };
    const next = reduce(start, { kind: "resumeClicked", countdownSecs: COUNTDOWN_SECS });
    expect(next.mode).toBe("countdown");
    if (next.mode === "countdown") {
      expect(next.intent).toBe("resume");
      expect(next.resumeOffset).toBe(42);
    }
  });

  it("paused → stopped immediately on stopClicked (no loop running)", () => {
    const start: AppState = {
      mode: "paused",
      position: 42,
      charsTyped: 40,
      totalChars: 100,
      durationMs: 1_000,
    };
    const next = reduce(start, { kind: "stopClicked" });
    expect(next.mode).toBe("stopped");
    if (next.mode === "stopped") {
      expect(next.charsTyped).toBe(40);
      expect(next.totalChars).toBe(100);
    }
  });

  it("done → idle on doneTimeout", () => {
    const start: AppState = { mode: "done", chars: 100, skipped: 0, durationMs: 4_000 };
    const next = reduce(start, { kind: "doneTimeout" });
    expect(next.mode).toBe("idle");
  });

  it("openSettings is allowed from idle, stopped, and done; rejected during a send", () => {
    expect(reduce({ mode: "idle" }, { kind: "openSettings" }).mode).toBe("settings");
    const stopped: AppState = {
      mode: "stopped",
      charsTyped: 4,
      totalChars: 10,
      durationMs: 500,
    };
    expect(reduce(stopped, { kind: "openSettings" }).mode).toBe("settings");
    const done: AppState = {
      mode: "done",
      chars: 10,
      skipped: 0,
      durationMs: 1000,
    };
    expect(reduce(done, { kind: "openSettings" }).mode).toBe("settings");
    const sending: AppState = {
      mode: "sending",
      charsTyped: 0,
      totalChars: 10,
      startedAtMs: 0,
    };
    expect(reduce(sending, { kind: "openSettings" }).mode).toBe("sending");
  });

  it("closeSettings returns to idle", () => {
    const next = reduce({ mode: "settings" }, { kind: "closeSettings" });
    expect(next.mode).toBe("idle");
  });

  it("countdown → idle on stopClicked (cancels pre-send)", () => {
    const start: AppState = {
      mode: "countdown",
      remaining: 2,
      intent: "send",
      resumeOffset: 0,
    };
    const next = reduce(start, { kind: "stopClicked" });
    expect(next.mode).toBe("idle");
  });

  // B-02: live progress tick from typer-core's progress callback.
  it("ipcSendProgress updates charsTyped while in sending mode", () => {
    const start: AppState = {
      mode: "sending",
      charsTyped: 0,
      totalChars: 500,
      startedAtMs: 0,
    };
    const next = reduce(start, { kind: "ipcSendProgress", charsTyped: 150 });
    expect(next.mode).toBe("sending");
    if (next.mode === "sending") {
      expect(next.charsTyped).toBe(150);
      expect(next.totalChars).toBe(500); // preserved
      expect(next.startedAtMs).toBe(0); // preserved
    }
  });

  it("ipcSendProgress is a no-op outside sending mode", () => {
    const idle: AppState = { mode: "idle" };
    expect(reduce(idle, { kind: "ipcSendProgress", charsTyped: 50 })).toBe(idle);

    const paused: AppState = {
      mode: "paused",
      position: 100,
      charsTyped: 100,
      totalChars: 500,
      durationMs: 2_000,
    };
    const next = reduce(paused, { kind: "ipcSendProgress", charsTyped: 200 });
    expect(next).toBe(paused);
  });
});
