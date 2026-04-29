import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./resize-handle";

function dispatchWindowMouse(type: "mousemove" | "mouseup", clientX: number) {
  window.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
}

describe("ResizeHandle — render", () => {
  it("renders a div with the resize handle test id and cursor class", () => {
    render(<ResizeHandle onResize={vi.fn()} onCommit={vi.fn()} />);
    const handle = screen.getByTestId("sidebar-resize-handle");
    expect(handle).toBeInTheDocument();
    expect(handle.className).toMatch(/cursor-col-resize/);
  });

  it("has accessible role and label", () => {
    render(<ResizeHandle onResize={vi.fn()} onCommit={vi.fn()} />);
    const handle = screen.getByRole("slider", { name: /resize sidebar/i });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuemin", "180");
    expect(handle).toHaveAttribute("aria-valuemax", "600");
  });
});

describe("ResizeHandle — drag flow (relative motion)", () => {
  it("mousedown alone does NOT fire onResize (no jump on click)", () => {
    const onResize = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={vi.fn()} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 263 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("mousemove deltas track cursor 1:1 relative to mousedown anchor", () => {
    // Sidebar is 260px. Cursor lands at clientX=263 inside the 4px
    // handle. Move to clientX=270 → delta=+7 → newWidth=267. Move to
    // clientX=285 → delta=+22 → newWidth=282.
    const onResize = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={vi.fn()} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 263 });
    dispatchWindowMouse("mousemove", 270);
    dispatchWindowMouse("mousemove", 285);
    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenNthCalledWith(1, 267);
    expect(onResize).toHaveBeenNthCalledWith(2, 282);
  });

  it("works regardless of where in the handle the cursor lands on mousedown", () => {
    // Same sidebar, same drag (10px right), but cursor lands at the
    // far-left edge of the 4px handle (clientX=257 vs. width=260,
    // technically a -3px overlap). The drag should still produce a
    // +10px width change, ending at 270.
    const onResize = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={vi.fn()} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 257 });
    dispatchWindowMouse("mousemove", 267);
    expect(onResize).toHaveBeenCalledWith(270);
  });

  it("anchor uses currentPx, not the cursor's clientX", () => {
    // Sidebar is at 400px; user grabs handle at clientX=402 and moves
    // to clientX=420. Delta=+18, startWidth=400, newWidth=418.
    const onResize = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={vi.fn()} currentPx={400} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 402 });
    dispatchWindowMouse("mousemove", 420);
    expect(onResize).toHaveBeenCalledWith(418);
  });

  it("mouseup fires onCommit with final width and removes listeners", () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={onCommit} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 263 });
    dispatchWindowMouse("mousemove", 320);
    dispatchWindowMouse("mouseup", 320);

    // delta=320-263=57; final width = 260+57 = 317.
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(317);

    // Subsequent mousemoves are ignored (listeners removed).
    onResize.mockClear();
    dispatchWindowMouse("mousemove", 400);
    expect(onResize).not.toHaveBeenCalled();
  });

  it("clamps to floor when the computed width drops below 180", () => {
    // Sidebar at 260, drag left by 200 (way past the floor).
    const onResize = vi.fn();
    const onCommit = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={onCommit} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 260 });
    dispatchWindowMouse("mousemove", 60);
    dispatchWindowMouse("mouseup", 60);
    expect(onResize).toHaveBeenLastCalledWith(180);
    expect(onCommit).toHaveBeenCalledWith(180);
  });

  it("clamps to ceiling when the computed width exceeds 600", () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={onCommit} currentPx={260} />);
    fireEvent.mouseDown(screen.getByTestId("sidebar-resize-handle"), { clientX: 260 });
    dispatchWindowMouse("mousemove", 1000);
    dispatchWindowMouse("mouseup", 1000);
    expect(onResize).toHaveBeenLastCalledWith(600);
    expect(onCommit).toHaveBeenCalledWith(600);
  });
});

describe("ResizeHandle — double-click reset", () => {
  it("double-click fires onCommit with the default", () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    render(<ResizeHandle onResize={onResize} onCommit={onCommit} />);
    fireEvent.doubleClick(screen.getByTestId("sidebar-resize-handle"));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(260);
  });

  it("double-click respects custom defaultPx", () => {
    const onCommit = vi.fn();
    render(<ResizeHandle onResize={vi.fn()} onCommit={onCommit} defaultPx={400} />);
    fireEvent.doubleClick(screen.getByTestId("sidebar-resize-handle"));
    expect(onCommit).toHaveBeenCalledWith(400);
  });
});
