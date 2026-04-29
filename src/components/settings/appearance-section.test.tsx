import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppearanceCfg } from "@/lib/core/appearance";
import { AppearanceSection, type AppearanceSectionProps } from "./appearance-section";

const defaultAppearance: AppearanceCfg = {
  profile: "atelier",
  mode: "system",
  fontSize: 1.0,
};

function defaults(overrides: Partial<AppearanceSectionProps> = {}): AppearanceSectionProps {
  return {
    appearance: defaultAppearance,
    onChange: vi.fn(),
    ...overrides,
  };
}

describe("AppearanceSection — Profile", () => {
  it("renders all five profile rows", () => {
    render(<AppearanceSection {...defaults()} />);
    expect(screen.getByRole("button", { name: /Terminal Atelier/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solarized/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nord/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dracula/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /High contrast/ })).toBeInTheDocument();
  });

  it("marks the active profile with aria-pressed", () => {
    render(
      <AppearanceSection
        {...defaults({ appearance: { ...defaultAppearance, profile: "nord" } })}
      />,
    );
    const nord = screen.getByRole("button", { name: /Nord/ });
    expect(nord).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Solarized fires onChange with profile=solarized", async () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    await userEvent.click(screen.getByRole("button", { name: /Solarized/ }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, profile: "solarized" });
  });

  it("clicking the already-active profile does not fire onChange", async () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    await userEvent.click(screen.getByRole("button", { name: /Terminal Atelier/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AppearanceSection — Mode", () => {
  it("renders Light, Dark, System segmented control", () => {
    render(<AppearanceSection {...defaults()} />);
    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
  });

  it("clicking Light fires onChange with mode=light", async () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, mode: "light" });
  });

  it("marks the active mode with aria-pressed", () => {
    render(
      <AppearanceSection {...defaults({ appearance: { ...defaultAppearance, mode: "dark" } })} />,
    );
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("AppearanceSection — UI size", () => {
  it("renders Small / Medium / Large preset buttons", () => {
    render(<AppearanceSection {...defaults()} />);
    expect(screen.getByRole("button", { name: "Small" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Large" })).toBeInTheDocument();
  });

  it("clicking Medium fires onChange with fontSize=1.15", async () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    await userEvent.click(screen.getByRole("button", { name: "Medium" }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, fontSize: 1.15 });
  });

  it("marks the active preset with aria-pressed", () => {
    render(
      <AppearanceSection {...defaults({ appearance: { ...defaultAppearance, fontSize: 1.3 } })} />,
    );
    expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute("aria-pressed", "true");
  });

  it("custom % input commits on Enter with valid number", () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText("Custom") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, fontSize: 1.5 });
  });

  it("custom % input commits on blur", () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText("Custom") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, fontSize: 1.2 });
  });

  it("custom % input clamps when given out-of-range values", () => {
    const onChange = vi.fn();
    render(<AppearanceSection {...defaults({ onChange })} />);
    const input = screen.getByLabelText("Custom") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ ...defaultAppearance, fontSize: 2.0 });
  });

  it("custom % input reverts to current scale on garbage input", () => {
    const onChange = vi.fn();
    render(
      <AppearanceSection
        {...defaults({ appearance: { ...defaultAppearance, fontSize: 1.15 }, onChange })}
      />,
    );
    const input = screen.getByLabelText("Custom") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("115");
  });

  it("initial input value reflects appearance.fontSize", () => {
    render(
      <AppearanceSection {...defaults({ appearance: { ...defaultAppearance, fontSize: 1.3 } })} />,
    );
    expect((screen.getByLabelText("Custom") as HTMLInputElement).value).toBe("130");
  });
});
