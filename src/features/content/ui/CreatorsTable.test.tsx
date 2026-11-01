// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CreatorsTable from "./CreatorsTable";
import type { CreatorsPage } from "@/features/content/data/competitors";

vi.mock("@/features/content/data/competitor-actions", () => ({ addCreatorAction: vi.fn(), removeCreatorAction: vi.fn() }));

const page = (over: Partial<CreatorsPage> = {}): CreatorsPage => ({
  creators: [
    {
      id: "c1", username: "micro.investing", status: "watching", last_pulled_at: "2026-11-03T11:00:00Z", last_pull_status: "ready", median: 1200, count: 9, thin: false,
      popular: [{ id: "p1", url: "https://www.instagram.com/p/A1/", posted_at: "2026-10-30T12:00:00Z", multiple: 3.4, briefed: true }],
    },
    { id: "c2", username: "gone", status: "removed", last_pulled_at: null, last_pull_status: null, median: null, count: 0, thin: true, popular: [] },
  ],
  lastRun: { id: "r1", apify_run_id: "a", status: "ready", error: "", started_at: "2026-11-02T11:00:00Z", finished_at: "2026-11-03T11:00:00Z", cost_usd: 0.08, items: 41 },
  ...over,
});

describe("CreatorsTable", () => {
  it("lists a watching creator with median, count, last pull and popular posts", () => {
    render(<CreatorsTable page={page()} />);
    expect(screen.getByText("@micro.investing")).toBeTruthy();
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByRole("link", { name: /3.4×/ }).getAttribute("href")).toBe("https://www.instagram.com/p/A1/");
    expect(screen.getByText(/briefed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove @micro.investing" })).toBeTruthy();
  });

  it("shows a removed creator with Add back", () => {
    render(<CreatorsTable page={page()} />);
    expect(screen.getByText("Removed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add back @gone" })).toBeTruthy();
  });

  it("states the last run, or why it failed", () => {
    const { unmount } = render(<CreatorsTable page={page()} />);
    expect(screen.getByText(/Last pull: Nov 3, 41 posts, \$0.08/)).toBeTruthy();
    unmount();
    render(<CreatorsTable page={page({ lastRun: { ...page().lastRun!, status: "failed", error: "FAILED: blocked" } })} />);
    expect(screen.getByText("Last pull failed: FAILED: blocked")).toBeTruthy();
  });

  it("has an empty state", () => {
    render(<CreatorsTable page={{ creators: [], lastRun: null }} />);
    expect(screen.getByText("No creators yet. Add one to start the weekly pull.")).toBeTruthy();
  });
});
