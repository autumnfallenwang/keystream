import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BinaryFileWarning } from "./binary-file-warning";

describe("BinaryFileWarning", () => {
  it("renders the filename", () => {
    render(<BinaryFileWarning filename="image.png" reason="not utf-8" onBack={vi.fn()} />);
    expect(screen.getByTestId("binary-file-warning")).toBeInTheDocument();
    expect(screen.getByTestId("binary-file-warning-name")).toHaveTextContent("image.png");
  });

  it("uses the binary headline when reason mentions UTF-8", () => {
    render(
      <BinaryFileWarning filename="a.png" reason="file is not valid UTF-8" onBack={vi.fn()} />,
    );
    expect(screen.getByText(/this file is not a text file/i)).toBeInTheDocument();
  });

  it("uses the size headline when reason mentions 'too large'", () => {
    render(
      <BinaryFileWarning
        filename="big.bin"
        reason="file too large: more than 1048576 bytes"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/this file is too large to open/i)).toBeInTheDocument();
  });

  it("falls back to a generic headline for unknown reasons", () => {
    render(<BinaryFileWarning filename="x" reason="permission denied" onBack={vi.fn()} />);
    expect(screen.getByText(/keystream couldn't open this file/i)).toBeInTheDocument();
  });

  it("clicking Back invokes onBack", () => {
    const onBack = vi.fn();
    render(<BinaryFileWarning filename="x" reason="not utf-8" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
