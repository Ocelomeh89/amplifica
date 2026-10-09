import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UnusedCard from "./UnusedCard";

vi.mock("@/features/content/data/actions", () => ({ reviveIdea: vi.fn(), archiveIdea: vi.fn() }));

const idea = { id: "i1", format: "reel" as const, hook: "I took a W-2.", title: "Runway", reason: "unreviewed" as const, age_days: 20, obsidian_path: null };

describe("UnusedCard", () => {
  it("shows the hook, why it is here, and its age", () => {
    render(<UnusedCard idea={idea} draft={null} />);
    expect(screen.getByText("I took a W-2.")).toBeTruthy();
    expect(screen.getByText(/never reviewed/i)).toBeTruthy();
    expect(screen.getByText(/20 days/)).toBeTruthy();
  });
  it("says liked but never posted for the queued reason", () => {
    render(<UnusedCard idea={{ ...idea, reason: "unposted", age_days: 35 }} draft={null} />);
    expect(screen.getByText(/liked, never posted/i)).toBeTruthy();
  });
  it("shows the draft state when a draft exists", () => {
    render(<UnusedCard idea={idea} draft={{ stage: "humanized", version: 2, block: 1, warn: 0 }} />);
    expect(screen.getByText(/drafted/i)).toBeTruthy();
  });
  it("offers Revive and Archive", () => {
    render(<UnusedCard idea={idea} draft={null} />);
    expect(screen.getByRole("button", { name: /revive/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /archive/i })).toBeTruthy();
  });
});
