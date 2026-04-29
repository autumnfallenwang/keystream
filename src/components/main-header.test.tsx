import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/core/app-state";
import { MainHeader, type MainHeaderProps } from "./main-header";

const idle: AppState = { mode: "idle" };
const sending: AppState = {
  mode: "sending",
  charsTyped: 100,
  totalChars: 500,
  startedAtMs: 0,
};
const paused: AppState = {
  mode: "paused",
  position: 100,
  charsTyped: 100,
  totalChars: 500,
  durationMs: 1_000,
};
const countdown: AppState = {
  mode: "countdown",
  remaining: 2,
  intent: "send",
  resumeOffset: 0,
};

function defaults(overrides: Partial<MainHeaderProps> = {}): MainHeaderProps {
  return {
    state: idle,
    filename: null,
    locked: false,
    totalChars: 0,
    wrap: false,
    canSend: false,
    sendDisabledReason: null,
    onToggleLocked: vi.fn(),
    onToggleWrap: vi.fn(),
    onSend: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe("MainHeader — filename slot (Q21)", () => {
  it("renders 'Untitled' when no file is loaded", () => {
    render(<MainHeader {...defaults({ filename: null })} />);
    expect(screen.getByTestId("filename-slot")).toHaveTextContent("Untitled");
  });

  it("renders the supplied filename", () => {
    render(<MainHeader {...defaults({ filename: "notes.txt" })} />);
    expect(screen.getByTestId("filename-slot")).toHaveTextContent("notes.txt");
  });
});

describe("MainHeader — Edit/Lock switch", () => {
  it("clicking Lock invokes onToggleLocked(true)", async () => {
    const onToggleLocked = vi.fn();
    render(<MainHeader {...defaults({ locked: false, onToggleLocked })} />);
    await userEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(onToggleLocked).toHaveBeenCalledWith(true);
  });

  it("clicking Edit invokes onToggleLocked(false)", async () => {
    const onToggleLocked = vi.fn();
    render(<MainHeader {...defaults({ locked: true, onToggleLocked })} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onToggleLocked).toHaveBeenCalledWith(false);
  });

  it("switch is disabled during sending / paused / countdown", () => {
    for (const state of [sending, paused, countdown] as const) {
      const { unmount } = render(<MainHeader {...defaults({ state })} />);
      expect(screen.getByRole("button", { name: "Lock" })).toBeDisabled();
      unmount();
    }
  });
});

describe("MainHeader — Wrap toggle (Q21)", () => {
  it("renders aria-pressed=false when wrap is off", () => {
    render(<MainHeader {...defaults({ wrap: false })} />);
    expect(screen.getByTestId("wrap-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  it("renders aria-pressed=true when wrap is on", () => {
    render(<MainHeader {...defaults({ wrap: true })} />);
    expect(screen.getByTestId("wrap-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the wrap toggle invokes onToggleWrap", async () => {
    const onToggleWrap = vi.fn();
    render(<MainHeader {...defaults({ onToggleWrap })} />);
    await userEvent.click(screen.getByTestId("wrap-toggle"));
    expect(onToggleWrap).toHaveBeenCalledOnce();
  });
});

describe("MainHeader — Send / Pause / Resume / Stop (Q21)", () => {
  it("idle + canSend=true: 'Send' is enabled and click invokes onSend", async () => {
    const onSend = vi.fn();
    render(<MainHeader {...defaults({ canSend: true, onSend })} />);
    const btn = screen.getByRole("button", { name: "Send" });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("idle + canSend=false: 'Send' is disabled and surfaces sendDisabledReason in title", () => {
    render(
      <MainHeader
        {...defaults({ canSend: false, sendDisabledReason: "Lock the text to send." })}
      />,
    );
    const btn = screen.getByRole("button", { name: "Send" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Lock the text to send.");
  });

  it("sending: primary becomes 'Pause', click invokes onPause", async () => {
    const onPause = vi.fn();
    render(<MainHeader {...defaults({ state: sending, onPause })} />);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("paused: primary becomes 'Resume', click invokes onResume", async () => {
    const onResume = vi.fn();
    render(<MainHeader {...defaults({ state: paused, onResume })} />);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("done + canSend=true: 'Send' is enabled (post-completion restart)", () => {
    const done: AppState = { mode: "done", chars: 500, skipped: 0, durationMs: 5000 };
    render(<MainHeader {...defaults({ state: done, canSend: true })} />);
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("Stop is disabled in idle / done / stopped", () => {
    for (const state of [
      idle,
      { mode: "done", chars: 0, skipped: 0, durationMs: 0 } as AppState,
      { mode: "stopped", position: 0, charsTyped: 0, totalChars: 100, durationMs: 0 } as AppState,
    ]) {
      const { unmount } = render(<MainHeader {...defaults({ state })} />);
      expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
      unmount();
    }
  });

  it("Stop is enabled during sending and invokes onStop", async () => {
    const onStop = vi.fn();
    render(<MainHeader {...defaults({ state: sending, onStop })} />);
    const btn = screen.getByRole("button", { name: "Stop" });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("Stop is enabled during paused", () => {
    render(<MainHeader {...defaults({ state: paused })} />);
    expect(screen.getByRole("button", { name: "Stop" })).not.toBeDisabled();
  });
});

describe("MainHeader — status sub-row (Q21)", () => {
  it("renders the status sub-row during sending", () => {
    render(<MainHeader {...defaults({ state: sending, totalChars: 500 })} />);
    expect(screen.getByTestId("header-status-line")).toHaveTextContent(/Typing/);
  });

  it("renders the status sub-row during paused (with elapsed time)", () => {
    render(<MainHeader {...defaults({ state: paused, totalChars: 500 })} />);
    const row = screen.getByTestId("header-status-line");
    expect(row).toHaveTextContent(/Paused/);
    expect(row).toHaveTextContent(/1\.0s/);
  });

  it("does NOT render the status sub-row in idle", () => {
    render(<MainHeader {...defaults({ state: idle })} />);
    expect(screen.queryByTestId("header-status-line")).toBeNull();
  });
});
