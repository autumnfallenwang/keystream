import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/core/app-state";
import { ActionBar, type ActionBarProps } from "./action-bar";

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
  durationMs: 2_000,
};
const done: AppState = { mode: "done", chars: 500, skipped: 0, durationMs: 30_000 };
const stopped: AppState = {
  mode: "stopped",
  charsTyped: 100,
  totalChars: 500,
  durationMs: 2_000,
};

function defaults(overrides: Partial<ActionBarProps> = {}): ActionBarProps {
  return {
    state: idle,
    canSend: true,
    totalChars: 0,
    onSend: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe("ActionBar — primary button label per state", () => {
  it("idle + canSend=true: 'Send', enabled, click invokes onSend", async () => {
    const onSend = vi.fn();
    render(<ActionBar {...defaults({ state: idle, canSend: true, onSend })} />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).not.toBeDisabled();
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("idle + canSend=false: 'Send' is disabled", () => {
    render(<ActionBar {...defaults({ state: idle, canSend: false })} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sending: 'Pause', click invokes onPause", async () => {
    const onPause = vi.fn();
    render(<ActionBar {...defaults({ state: sending, totalChars: 500, onPause })} />);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("done + canSend=true: Send is enabled (post-completion restart)", () => {
    // B-01 regression: page.tsx must mark canSend=true in done mode so
    // the user can fire a fresh send after completion.
    render(<ActionBar {...defaults({ state: done, canSend: true })} />);
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("stopped + canSend=true: Send is enabled (post-stop restart)", () => {
    // B-01 regression: this was the original failure mode — Stop from
    // paused left Send disabled forever.
    render(<ActionBar {...defaults({ state: stopped, canSend: true, totalChars: 500 })} />);
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("paused: 'Resume', click invokes onResume", async () => {
    const onResume = vi.fn();
    render(<ActionBar {...defaults({ state: paused, totalChars: 500, onResume })} />);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
  });
});

describe("ActionBar — Stop button enabling", () => {
  it("Stop is disabled in idle", () => {
    render(<ActionBar {...defaults({ state: idle })} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
  });

  it("Stop is enabled during sending and invokes onStop", async () => {
    const onStop = vi.fn();
    render(<ActionBar {...defaults({ state: sending, totalChars: 500, onStop })} />);
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(stop).not.toBeDisabled();
    await userEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("Stop is enabled during paused", () => {
    render(<ActionBar {...defaults({ state: paused, totalChars: 500 })} />);
    expect(screen.getByRole("button", { name: "Stop" })).not.toBeDisabled();
  });

  it("Stop is disabled in done state", () => {
    render(<ActionBar {...defaults({ state: done })} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
  });

  it("Stop is disabled in stopped state", () => {
    render(<ActionBar {...defaults({ state: stopped, totalChars: 500 })} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
  });
});

describe("ActionBar — status line", () => {
  it("renders 'Typing N / N' during sending", () => {
    render(<ActionBar {...defaults({ state: sending, totalChars: 500 })} />);
    expect(screen.getByText(/Typing 100 \/ 500/)).toBeInTheDocument();
  });

  it("renders 'Done' message after completion", () => {
    render(<ActionBar {...defaults({ state: done })} />);
    expect(screen.getByText(/Done · 500 chars/)).toBeInTheDocument();
  });

  it("does not render status line in idle", () => {
    render(<ActionBar {...defaults({ state: idle })} />);
    expect(screen.queryByText(/Typing/)).toBeNull();
    expect(screen.queryByText(/Done/)).toBeNull();
  });
});
