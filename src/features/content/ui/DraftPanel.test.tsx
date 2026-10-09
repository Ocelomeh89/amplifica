import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DraftPanel from "./DraftPanel";

const lint = [{ level: "warn", rule: "em-dash", excerpt: "the loan — and the rate" }];

describe("DraftPanel", () => {
  it("tells how to draft when nothing exists", () => {
    render(<DraftPanel ideaId="i1" status="queued" draft={null} obsidianPath={null} />);
    expect(screen.getByText(/no draft yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy \/content-draft i1/i })).toBeTruthy();
  });
  it("shows the draft body, lint hits and the Obsidian path", () => {
    render(<DraftPanel ideaId="i1" status="queued" draft={{ stage: "humanized", version: 2, body: "Body text here", lint }} obsidianPath="C - Writing/Content/reel/x.md" />);
    expect(screen.getByText("Body text here")).toBeTruthy();
    expect(screen.getByText(/em-dash/)).toBeTruthy();
    expect(screen.getByText("C - Writing/Content/reel/x.md")).toBeTruthy();
  });
  it("after posting, shows only the Obsidian reference", () => {
    render(<DraftPanel ideaId="i1" status="posted" draft={null} obsidianPath="C - Writing/Content/reel/x.md" />);
    expect(screen.getByText("C - Writing/Content/reel/x.md")).toBeTruthy();
    expect(screen.queryByText(/no draft yet/i)).toBeNull();
  });
  it("does not offer the draft command for ideas that are not queued", () => {
    render(<DraftPanel ideaId="i1" status="inbox" draft={null} obsidianPath={null} />);
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/no draft yet/i)).toBeNull();
    expect(screen.getByText("No draft.")).toBeTruthy();
  });
});
