// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PerformanceTable, { type TableRow } from "./PerformanceTable";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("window=30&tag=hook_type:question") }));
vi.mock("@/features/content/data/tag-actions", () => ({ saveTagCorrection: vi.fn() }));

const row = (id: string, over: Partial<TableRow> = {}): TableRow =>
  ({
    id, platform: "instagram", format: "reel", media_type: "reel", pillar: "", hook_type: "", hook_used: "",
    posted_at: "2026-10-20T00:00:00Z", metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null,
    n_saves: null, n_shares: null, n_watch: null, n_reach: null, onscreen_text: "", message: "", cta_type: "", post_style: "",
    cover_face: null, cover_text: null, cover_number: null, hook_spoken: "", hook_onscreen: "", tag_confidence: {}, tag_locks: [],
    tagged_at: null, url: "https://instagram.com/reel/x", caption: "Cap", idea_id: null, views: null, n_views: null,
    n_views_mode: "none", n_views_day: null, n_views_thin: false, status: null, evergreen: false, ...over,
  }) as TableRow;

describe("PerformanceTable", () => {
  it("links an Instagram row to its page, carrying the current filters in back", () => {
    render(<PerformanceTable rows={[row("p1")]} />);
    const href = screen.getByRole("link", { name: "details" }).getAttribute("href")!;
    expect(href.startsWith("/content/performance/p1?back=")).toBe(true);
    expect(decodeURIComponent(href.split("back=")[1])).toBe("?window=30&tag=hook_type%3Aquestion");
  });

  it("has no details link for a non-Instagram row", () => {
    render(<PerformanceTable rows={[row("p2", { platform: "youtube" })]} />);
    expect(screen.queryByRole("link", { name: "details" })).toBeNull();
  });
});
