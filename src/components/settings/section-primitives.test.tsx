import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsSection } from "./section-primitives";

describe("SettingsSection — Q17", () => {
  it("renders the title as an h2", () => {
    render(
      <SettingsSection title="Profile">
        <p>body</p>
      </SettingsSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Profile" });
    expect(heading).toBeInTheDocument();
  });

  it("renders the info icon when help is provided", () => {
    render(
      <SettingsSection title="Mode" help="Choose light/dark/system">
        <p>body</p>
      </SettingsSection>,
    );
    const icon = screen.getByRole("img", { name: /Mode help: Choose light\/dark\/system/ });
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("title", "Choose light/dark/system");
  });

  it("does not render an info icon when help is omitted", () => {
    render(
      <SettingsSection title="Profile">
        <p>body</p>
      </SettingsSection>,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("wraps content in a card by default", () => {
    render(
      <SettingsSection title="Profile">
        <p data-testid="content">body</p>
      </SettingsSection>,
    );
    const content = screen.getByTestId("content");
    const cardShell = content.parentElement;
    expect(cardShell?.className).toMatch(/rounded-md/);
    expect(cardShell?.className).toMatch(/border-hairline/);
    expect(cardShell?.className).toMatch(/bg-elevated/);
  });

  it("omits card shell when card={false}", () => {
    render(
      <SettingsSection title="Profile" card={false}>
        <p data-testid="content">body</p>
      </SettingsSection>,
    );
    const content = screen.getByTestId("content");
    const wrapper = content.parentElement;
    expect(wrapper?.className).toBe("");
  });
});
