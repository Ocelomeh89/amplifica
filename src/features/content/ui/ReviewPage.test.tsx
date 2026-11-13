import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewPage, { type ReviewPageProps } from "./ReviewPage";
import type { ContentReview } from "@/shared/supabase/database.types";
import type { ReviewData, ReviewPost } from "@/features/content/engine/review";

vi.mock("@/features/content/data/review-actions", () => ({ bringBackAction: vi.fn(), buildNowAction: vi.fn() }));
vi.mock("@/features/content/data/actions", () => ({ archiveIdea: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const post = (over: Partial<ReviewPost> = {}): ReviewPost => ({
  id: "p1", title: "Your paycheck is not the problem", url: "https://instagram.com/reel/p1/", media_type: "reel", views: 21400, n_views: 3.1,
  second: { metric: "saves", value: 88, multiple: 1.4 }, early: true, why: "A Belief attacking hook on a topic that has won before.", ...over,
});
const data = (over: Partial<ReviewData> = {}): ReviewData => ({
  week_start: "2026-11-09", as_of: "2026-11-16T06:00:00.000Z", line: { posts: 4, beat: 1, far_below: 1 },
  tiles: { views: { total: 48200, usual: 34000, multiple: 1.4 }, saves: { total: 212, usual: 230, multiple: 0.9 }, shares: { total: 96, usual: 80, multiple: 1.2 }, follows: { total: null, usual: null, multiple: null } },
  worked: [post()], didnt: [post({ id: "p2", title: "How an amortized payment works", views: 1100, n_views: 0.2, second: null, early: false, why: "No clear reason." })],
  usual: [{ id: "p3", title: "A usual one" }], too_early: [{ id: "p4", title: "Sunday's post" }],
  pillars: [{ pillar: "w2-advantage", posts: 2, median_multiple: 2.5 }, { pillar: "freedom-paradox", posts: 0, median_multiple: null }],
  gate: { checked: 14, passed: 9, rewritten: 2, failed: 3, failures: [{ id: "i1", title: "What actually happens before a foreclosure", format: "reel", reasons: ["Plain words: \"Note seller\" is never explained."] }] },
  why: "ok", ...over,
});
const review = (over: Partial<ContentReview> = {}, d: ReviewData = data()): ContentReview =>
  ({ ...over, id: "r", user_id: "u", week_start: "2026-11-09", narrative_md: "A quiet week.", double_down: [], stop: [], best_times: {}, plan: [], replies_owed: [], review: d, built_at: "2026-11-16T13:30:00Z", created_at: "", updated_at: "" }) as unknown as ContentReview;
const props = (over: Partial<ReviewPageProps> = {}): ReviewPageProps => ({ review: review(), weeks: ["2026-11-09", "2026-11-02", "2026-10-26"], skips: [], gateFailed: [], test: null, suggestions: null, newest: true, ...over });

describe("ReviewPage", () => {
  it("shows the summary line, the narrative and the four tiles", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getByText("4 posts. 1 beat your usual views, 1 was far below.")).toBeInTheDocument();
    expect(screen.getByText("A quiet week.")).toBeInTheDocument();
    expect(screen.getByText("48,200")).toBeInTheDocument();
    expect(screen.getByText("1.4x usual")).toBeInTheDocument();
  });

  it("a missing follows total reads not available", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getByText("not available")).toBeInTheDocument();
  });

  it("an early read is labelled, and each post links to its page with its why", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getAllByText("early read")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Your paycheck is not the problem" })).toHaveAttribute("href", "/content/performance/p1");
    expect(screen.getByText(/21,400 views \(3\.1x\) · 88 saves \(1\.4x\)/)).toBeInTheDocument();
    expect(screen.getByText("A Belief attacking hook on a topic that has won before.")).toBeInTheDocument();
    expect(screen.getByText(/Early reads use the numbers so far\. The lists below wait until a post is 7 days old\./)).toBeInTheDocument();
  });

  it("about usual and too early to call are one line each", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getByText("1 post was about usual: A usual one")).toBeInTheDocument();
    expect(screen.getByText("Too early to call: Sunday's post")).toBeInTheDocument();
  });

  it("the page hides the test section when its loader returns null", () => {
    render(<ReviewPage {...props({ test: null })} />);
    expect(screen.queryByText("This week's test")).toBeNull();
  });

  it("hides the suggestions section when its loader returns null", () => {
    render(<ReviewPage {...props({ suggestions: null })} />);
    expect(screen.queryByText("New creator suggestions")).toBeNull();
  });

  it("shows each when given a value", () => {
    render(<ReviewPage {...props({ test: { state: "open", question: "Does this hook beat your usual one?", owes: ["record", "post"], verdict: null, conclusion: null, href: "/content/tests" }, suggestions: { waiting: 2, href: "/content/creators" } })} />);
    expect(screen.getByText("This week's test")).toBeInTheDocument();
    expect(screen.getByText("Does this hook beat your usual one?")).toBeInTheDocument();
    expect(screen.getByText("New creator suggestions")).toBeInTheDocument();
    expect(screen.getByText(/2 suggestions wait for your answer/)).toBeInTheDocument();
  });

  it("lists all five pillars, with a dash for one with no post", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getByText("The W-2 Advantage")).toBeInTheDocument();
    expect(screen.getByText("The Freedom Paradox").parentElement?.textContent).toContain("0 posts · —");
    expect(screen.getByText("Life by Design")).toBeInTheDocument();
  });

  it("the newest week shows the live gate failures with Archive", () => {
    render(<ReviewPage {...props({ gateFailed: [{ id: "i1", title: "Live idea", format: "reel", source: null, failed: [{ item: "reader", reason: "Nobody." }] }] })} />);
    expect(screen.getByText("14 ideas checked. 9 passed as written, 2 after a rewrite, 3 didn't pass.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("an earlier week lists stored gate failures without an Archive button", () => {
    render(<ReviewPage {...props({ newest: false })} />);
    expect(screen.getByText("What actually happens before a foreclosure")).toBeInTheDocument();
    expect(screen.getByText(/never explained/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Build now" })).toBeNull();
  });

  it("with no review it offers Build now", () => {
    render(<ReviewPage {...props({ review: null, weeks: [] })} />);
    expect(screen.getByText(/No review yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build now" })).toBeInTheDocument();
  });

  it("the newest page has Build now and links to earlier weeks", () => {
    render(<ReviewPage {...props()} />);
    expect(screen.getByRole("button", { name: "Build now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nov 2" })).toHaveAttribute("href", "/content/review/2026-11-02");
    expect(screen.getByRole("link", { name: "Oct 26" })).toHaveAttribute("href", "/content/review/2026-10-26");
    expect(screen.queryByRole("link", { name: "Nov 9" })).toBeNull();
  });

  it("says when the explanations could not be written", () => {
    render(<ReviewPage {...props({ review: review({}, data({ why: "failed" })) })} />);
    expect(screen.getByText(/explanations could not be written/)).toBeInTheDocument();
  });
});
