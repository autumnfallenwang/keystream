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
    textLoaded: false,
    textCharCount: 0,
    accessibilityGranted: false,
    locked: false,
    totalChars: 0,
    onTextGateClick: vi.fn(),
    onAccessibilityGateClick: vi.fn(),
    onToggleLocked: vi.fn(),
    ...overrides,
  };
}

describe("MainHeader — gate mode (idle)", () => {
  it("shows 'Text loaded · N chars' when text is loaded", () => {
    render(
      <MainHeader {...defaults({ textLoaded: true, textCharCount: 15_017, totalChars: 15_017 })} />,
    );
    expect(screen.getByText(/Text loaded/)).toBeInTheDocument();
    expect(screen.getByText(/15,017 chars/)).toBeInTheDocument();
  });

  it("shows 'Lock to send' hint when text empty and not locked", () => {
    render(<MainHeader {...defaults({ textLoaded: false, locked: false })} />);
    expect(screen.getByText("Lock to send")).toBeInTheDocument();
  });

  it("shows 'No text loaded' when text empty but locked", () => {
    render(<MainHeader {...defaults({ textLoaded: false, locked: true })} />);
    expect(screen.getByText("No text loaded")).toBeInTheDocument();
  });

  it("renders Accessibility gate", () => {
    render(<MainHeader {...defaults({ accessibilityGranted: true })} />);
    expect(screen.getByText("Accessibility")).toBeInTheDocument();
  });
});

describe("MainHeader — status mode", () => {
  it("replaces gates with status line during sending", () => {
    render(<MainHeader {...defaults({ state: sending, totalChars: 500 })} />);
    expect(screen.getByText(/Typing/)).toBeInTheDocument();
    expect(screen.queryByText("Lock to send")).toBeNull();
  });

  it("shows paused status with elapsed time", () => {
    render(<MainHeader {...defaults({ state: paused, totalChars: 500 })} />);
    expect(screen.getByText(/Paused/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0s/)).toBeInTheDocument();
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

  it("switch is disabled during sending", () => {
    render(<MainHeader {...defaults({ state: sending })} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lock" })).toBeDisabled();
  });

  it("switch is disabled during paused", () => {
    render(<MainHeader {...defaults({ state: paused })} />);
    expect(screen.getByRole("button", { name: "Lock" })).toBeDisabled();
  });

  it("switch is disabled during countdown", () => {
    render(<MainHeader {...defaults({ state: countdown })} />);
    expect(screen.getByRole("button", { name: "Lock" })).toBeDisabled();
  });
});
