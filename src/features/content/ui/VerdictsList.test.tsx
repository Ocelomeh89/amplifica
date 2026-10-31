// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VerdictsList from "./VerdictsList";
import type { BriefView } from "@/features/content/data/today";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/features/content/data/actions", () => ({ markPosted: vi.fn() }));
vi.mock("@/features/content/data/today-actions", () => ({ swapBrief: vi.fn(), skipBriefAction: vi.fn() }));

const b = (over: Partial<BriefView>): BriefView =>
  ({
    id: "e1", idea_id: "i1", day: "2026-10-20", slot: 1, kind: "proposed", moment: "", variable: "hook_type", value: "paradox",
    recipe: { control: "question" }, reason: "", status: "judged", post_id: "p1", judge_at: null, verdict: "won",
    judge_metrics: { multiplier: 1.6, n_saves: 1.2, n_watch: 0.9 }, judged_at: "2026-10-27T10:00:00Z", created_at: "", idea: null, post: null,
    ...over,
  }) as BriefView;

describe("VerdictsList", () => {
  it("lists the verdict, the test, the figures and a link to the post", () => {
    render(<VerdictsList items={[b({})]} />);
    expect(screen.getByText("Won")).toBeTruthy();
    expect(screen.getByText(/Hook type: Paradox instead of Question/)).toBeTruthy();
    expect(screen.getByText(/Views 1.60×/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See the post" }).getAttribute("href")).toBe("/content/performance/p1");
  });
  it("shows Unjudged with its reason", () => {
    render(<VerdictsList items={[b({ status: "unjudged", verdict: null, judge_metrics: { reason: "No day-7 figure after 14 days." } })]} />);
    expect(screen.getByText("Unjudged")).toBeTruthy();
    expect(screen.getByText(/No day-7 figure after 14 days/)).toBeTruthy();
  });
  it("says so when empty", () => {
    render(<VerdictsList items={[]} />);
    expect(screen.getByText(/No verdicts this week/)).toBeTruthy();
  });
});
