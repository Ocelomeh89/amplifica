// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestCard from "./TestCard";
import { POSTING_NOTE } from "@/features/content/engine/test-lab-card";
import type { TestView, VersionRow } from "@/features/content/data/test-lab";

const saveNumbersAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null, judged: false }));
const skipTestAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
vi.mock("@/features/content/data/test-lab-actions", () => ({
  saveNumbersAction: (fd: FormData) => saveNumbersAction(fd),
  skipTestAction: (fd: FormData) => skipTestAction(fd),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const version = (label: "a" | "b", over: Partial<VersionRow> = {}): VersionRow => ({
  id: `v${label}`, user_id: "u1", test_id: "t1", label, value: label === "a" ? "ranking" : "question", idea_id: "i1",
  hook: label === "a" ? "Three numbers decide your freedom." : "What if your paycheck is the asset?", card_text: label === "a" ? "" : "Your paycheck is the asset",
  outline: ["Open on the number", "Say why it matters", "Give the next step"], gate: {}, post_id: null, link: "", typed_views: null, typed_saves: null, typed_shares: null,
  views_24h: null, saves_24h: null, shares_24h: null, read_at: null, promote: false, created_at: "", updated_at: "", ...over,
});
const test = (over: Partial<TestView> = {}, vs: [Partial<VersionRow>, Partial<VersionRow>] = [{}, {}]): TestView => ({
  id: "t1", user_id: "u1", kind: "opening", variable: "hook_type", value_a: "ranking", value_b: "question", held: {}, rule: 5,
  question: "Does Ranking beat Question?", reason: "You have not tried Ranking in the last 90 days. Is it better than Question, your usual?", why: "This checks a new hook against your usual.",
  notes: { record_once: "Record the body once.", record_twice: "Record two openings.", cuts: "Only the first line differs." }, status: "open", trigger: "button", dropped: [], error: "", skip_reason: "",
  verdict: null, verdict_line: "", conclusion: "", opened_at: "2026-11-15T00:00:00Z", judged_at: null, effects_at: null, closed_at: null, created_at: "", updated_at: "",
  versions: [version("a", vs[0]), version("b", vs[1])], ...over,
});
const labels = {};

describe("TestCard", () => {
  it("shows both versions, the single difference and the posting note", () => {
    render(<TestCard test={test()} labels={labels} />);
    expect(screen.getByText("Does Ranking beat Question?")).toBeTruthy();
    expect(screen.getByText(/You have not tried Ranking/)).toBeTruthy();
    expect(screen.getByText("Three numbers decide your freedom.")).toBeTruthy();
    expect(screen.getByText("What if your paycheck is the asset?")).toBeTruthy();
    expect(screen.getByText("No card")).toBeTruthy();
    expect(screen.getByText("Your paycheck is the asset")).toBeTruthy();
    expect(screen.getAllByText("Open on the number")).toHaveLength(2);
    expect(screen.getByText(/Only the hook type differs/)).toBeTruthy();
    expect(screen.getByText("Record the body once.")).toBeTruthy();
    expect(screen.getByText("Record two openings.")).toBeTruthy();
    expect(screen.getByText(POSTING_NOTE)).toBeTruthy();
    expect(screen.getByText("Version A: Ranking")).toBeTruthy();
    expect(screen.getByText("Version B: Question")).toBeTruthy();
  });

  it("names the single difference of each kind", () => {
    const { unmount } = render(<TestCard test={test({ kind: "card", variable: "onscreen_text", value_a: "none", value_b: "repeats-hook" }, [{ value: "none" }, { value: "repeats-hook" }])} labels={labels} />);
    expect(screen.getByText(/Only the on-screen card differs/)).toBeTruthy();
    unmount();
    render(<TestCard test={test({ kind: "topic", variable: "topic", value_a: "debt", value_b: "credit" }, [{ value: "debt" }, { value: "credit" }])} labels={{ debt: "Debt", credit: "Credit" }} />);
    expect(screen.getByText(/Only the topic differs/)).toBeTruthy();
    expect(screen.getByText("Version A: Debt")).toBeTruthy();
  });

  it("offers the three number boxes and a link box for each version, with when to read them", () => {
    render(<TestCard test={test()} labels={labels} />);
    expect(screen.getAllByLabelText("Views")).toHaveLength(2);
    expect(screen.getAllByLabelText("Saves")).toHaveLength(2);
    expect(screen.getAllByLabelText("Shares")).toHaveLength(2);
    expect(screen.getAllByLabelText(/Link/)).toHaveLength(2);
    expect(screen.getAllByText("Read these a day after posting.").length).toBeGreaterThan(0);
  });

  it("sends the typed numbers for one version", async () => {
    render(<TestCard test={test()} labels={labels} />);
    const [views] = screen.getAllByLabelText("Views");
    fireEvent.change(views, { target: { value: "2000" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save numbers/ })[0]);
    await waitFor(() => expect(saveNumbersAction).toHaveBeenCalled());
    const fd = saveNumbersAction.mock.calls.at(-1)![0];
    expect(fd.get("testId")).toBe("t1");
    expect(fd.get("label")).toBe("a");
    expect(fd.get("views")).toBe("2000");
  });

  it("skips with a reason", async () => {
    render(<TestCard test={test()} labels={labels} />);
    fireEvent.change(screen.getByLabelText("Why skip it?"), { target: { value: "Not this week" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip this test" }));
    await waitFor(() => expect(skipTestAction).toHaveBeenCalled());
    const fd = skipTestAction.mock.calls.at(-1)![0];
    expect(fd.get("id")).toBe("t1");
    expect(fd.get("reason")).toBe("Not this week");
  });

  it("shows the winner and the promote line only on the promoted version", () => {
    const judged = test(
      { status: "judged", verdict: "a", verdict_line: "Ranking won: 3,000 views against 1,100 in the first day.", conclusion: "Ranking won. Use it again." },
      [{ views_24h: 3000, saves_24h: 40, shares_24h: 12, promote: true }, { views_24h: 1100, saves_24h: 55, shares_24h: 3, promote: false }]
    );
    render(<TestCard test={judged} labels={labels} />);
    expect(screen.getByText("Winner")).toBeTruthy();
    expect(screen.getAllByText("Worth sharing to your followers.")).toHaveLength(1);
    expect(screen.getByText("3,000 views")).toBeTruthy();
    expect(screen.getByText("55 saves")).toBeTruthy();
    expect(screen.getByText("Ranking won. Use it again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save numbers/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip this test" })).toBeNull();
  });

  it("says no clear winner on a tie", () => {
    const tie = test({ status: "judged", verdict: "none", verdict_line: "No clear winner: 1,300 views against 1,100 in the first day." }, [{ views_24h: 1300 }, { views_24h: 1100 }]);
    render(<TestCard test={tie} labels={labels} />);
    expect(screen.getAllByText(/No clear winner/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Winner")).toBeNull();
  });

  it("falls back to the verdict line with no conclusion", () => {
    const judged = test({ status: "judged", verdict: "a", verdict_line: "Ranking won: 3,000 views against 1,100 in the first day.", conclusion: "" }, [{ views_24h: 3000 }, { views_24h: 1100 }]);
    render(<TestCard test={judged} labels={labels} />);
    expect(screen.getByText("Ranking won: 3,000 views against 1,100 in the first day.")).toBeTruthy();
  });
});
