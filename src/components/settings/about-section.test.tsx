import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AboutSection } from "./about-section";

vi.mock("@/lib/ipc", () => ({
  getAppVersion: vi.fn().mockResolvedValue("0.1.2"),
  checkForUpdate: vi.fn().mockResolvedValue(null),
  installUpdate: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
  logErr: vi.fn().mockResolvedValue(undefined),
}));

describe("AboutSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current version after the IPC roundtrip", async () => {
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByText("v0.1.2")).toBeInTheDocument();
    });
  });

  it("shows up-to-date when checkForUpdate returns null", async () => {
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByTestId("update-up-to-date")).toBeInTheDocument();
    });
  });

  it("treats a 404 'no release yet' error as up-to-date", async () => {
    const { checkForUpdate } = await import("@/lib/ipc");
    vi.mocked(checkForUpdate).mockRejectedValueOnce(new Error("server returned 404 not found"));
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByTestId("update-up-to-date")).toBeInTheDocument();
    });
  });

  it("surfaces a real network error to the user", async () => {
    const { checkForUpdate } = await import("@/lib/ipc");
    vi.mocked(checkForUpdate).mockRejectedValueOnce(new Error("connection refused"));
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByTestId("update-error")).toHaveTextContent(/connection refused/i);
    });
  });

  it("renders an Install button when an update is available", async () => {
    const { checkForUpdate } = await import("@/lib/ipc");
    vi.mocked(checkForUpdate).mockResolvedValueOnce({
      version: "0.2.0",
      notes: "release notes",
      date: "2026-04-29",
    });
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByTestId("update-available")).toBeInTheDocument();
    });
    expect(screen.getByText(/Version 0\.2\.0 available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Install$/i })).toBeInTheDocument();
  });

  it("links to the GitHub repo", async () => {
    render(<AboutSection />);
    const link = await screen.findByRole("link", {
      name: /github\.com\/autumnfallenwang\/keystream/i,
    });
    expect(link).toHaveAttribute("href", "https://github.com/autumnfallenwang/keystream");
  });
});
