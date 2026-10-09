import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DraftBadge from "./DraftBadge";

describe("DraftBadge", () => {
  it("says no draft", () => {
    render(<DraftBadge draft={null} obsidianPath={null} />);
    expect(screen.getByText(/no draft/i)).toBeTruthy();
  });
  it("shows stage and lint counts", () => {
    render(<DraftBadge draft={{ stage: "humanized", version: 2, block: 1, warn: 3 }} obsidianPath="C - Writing/Content/reel/x.md" />);
    expect(screen.getByText(/drafted/i)).toBeTruthy();
    expect(screen.getByText(/1 block/i)).toBeTruthy();
    expect(screen.getByText(/3 warn/i)).toBeTruthy();
  });
  it("is quiet about lint when clean", () => {
    render(<DraftBadge draft={{ stage: "humanized", version: 2, block: 0, warn: 0 }} obsidianPath={null} />);
    expect(screen.queryByText(/block|warn/i)).toBeNull();
  });
});
