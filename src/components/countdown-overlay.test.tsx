import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CountdownOverlay } from "./countdown-overlay";

describe("CountdownOverlay", () => {
  it("renders the remaining number when > 0", () => {
    render(<CountdownOverlay remaining={2} totalSecs={3} onCancel={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders 'GO' when remaining = 0", () => {
    render(<CountdownOverlay remaining={0} totalSecs={3} onCancel={vi.fn()} />);
    expect(screen.getByText("GO")).toBeInTheDocument();
  });

  it("Cancel button invokes onCancel", async () => {
    const onCancel = vi.fn();
    render(<CountdownOverlay remaining={2} totalSecs={3} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("focus lands on the Cancel button on mount", () => {
    render(<CountdownOverlay remaining={2} totalSecs={3} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus();
  });
});
