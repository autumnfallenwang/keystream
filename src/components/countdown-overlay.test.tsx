import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CountdownOverlay } from "./countdown-overlay";

describe("CountdownOverlay", () => {
  it("renders nothing when state is null", () => {
    const { container } = render(<CountdownOverlay state={null} onCancel={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the remaining numeral while counting down", () => {
    render(<CountdownOverlay state={{ remaining: 3 }} onCancel={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Click into the target window now/)).toBeInTheDocument();
  });

  it("renders 'GO' when remaining is 0", () => {
    render(<CountdownOverlay state={{ remaining: 0 }} onCancel={vi.fn()} />);
    expect(screen.getByText("GO")).toBeInTheDocument();
  });

  it("Cancel button is auto-focused on mount and fires onCancel when clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<CountdownOverlay state={{ remaining: 2 }} onCancel={onCancel} />);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
