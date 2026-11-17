// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DroppedCreators from "./DroppedCreators";

vi.mock("@/features/content/data/competitors/competitor-actions", () => ({ addCreatorAction: vi.fn(), removeCreatorAction: vi.fn() }));

const rows = [
  { username: "bigaccount", outcome: "out_of_band" as const, reason: "900k followers is 112x yours; the band is 2x to 20x", lookedAt: "2026-11-16T12:00:00.000Z" },
  { username: "ranked", outcome: "no_room" as const, reason: "Passed, but ranked below this week's suggestions", lookedAt: "2026-11-09T12:00:00.000Z" },
];

describe("DroppedCreators", () => {
  it("is closed by default and the summary shows the count", () => {
    const { container } = render(<DroppedCreators dropped={rows} />);
    expect(screen.getByText("Considered and dropped (2)")).toBeTruthy();
    expect((container.querySelector("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("a row has its reason, its date and an Add button for its username", () => {
    render(<DroppedCreators dropped={rows} />);
    expect(screen.getByText(/900k followers is 112x yours/)).toBeTruthy();
    expect(screen.getByText("2026-11-16")).toBeTruthy();
    expect(screen.getByRole("button", { name: /@bigaccount/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "@ranked" }).getAttribute("href")).toBe("https://www.instagram.com/ranked/");
  });

  it("renders nothing when nothing was dropped", () => {
    const { container } = render(<DroppedCreators dropped={[]} />);
    expect(container.textContent).toBe("");
  });
});
