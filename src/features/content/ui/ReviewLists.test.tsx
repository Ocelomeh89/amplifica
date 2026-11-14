import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DoubleDownList, SkipList } from "./ReviewLists";
import type { FocusRow } from "@/features/content/data/focus";

vi.mock("@/features/content/data/review-actions", () => ({ bringBackAction: vi.fn(), buildNowAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const skip = (over: Partial<FocusRow>): FocusRow => ({
  id: "r1", kind: "skip", dimension: "hook_type", value: "promise", won: 0, lost: 3, flat: 1, total: 4, source: "review", review_week: "2026-11-09",
  starts_on: "2026-11-16", ends_on: "2027-02-14", lifted_at: null, protected_until: null, ...over,
});

describe("DoubleDownList", () => {
  it("lists hooks before topics with n of m, and topic values by label", () => {
    render(
      <DoubleDownList
        rows={[
          { kind: "double_down", dimension: "topic", value: "predictable-income", won: 3, lost: 0, flat: 0, total: 3 },
          { kind: "double_down", dimension: "hook_type", value: "belief-attacking", won: 3, lost: 0, flat: 1, total: 4 },
        ]}
      />
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toBe("Hook: Belief attacking · 3 of 4 beat usual views");
    expect(items[1]).toBe("Topic: Why predictable income supports long-term investing · 3 of 3 beat usual views");
    expect(screen.getByText(/From posts at least 7 days old/)).toBeInTheDocument();
  });

  it("says so when nothing has earned a place", () => {
    render(<DoubleDownList rows={[]} />);
    expect(screen.getByText("No hook or topic qualifies yet.")).toBeInTheDocument();
  });
});

describe("SkipList", () => {
  it("an active skip shows its return date and Bring back", () => {
    render(<SkipList rows={[skip({})]} today="2026-11-20" />);
    expect(screen.getByRole("listitem").textContent).toContain("Hook: Promise · 0 of 4 · back Feb 14");
    expect(screen.getByRole("button", { name: "Bring back" })).toBeInTheDocument();
  });

  it("a lifted skip shows no button and says when it was brought back", () => {
    render(<SkipList rows={[skip({ lifted_at: "2026-11-18T18:00:00Z", protected_until: "2027-02-16" })]} today="2026-11-20" />);
    expect(screen.queryByRole("button", { name: "Bring back" })).toBeNull();
    expect(screen.getByRole("listitem").textContent).toContain("brought back Nov 18");
  });

  it("a skip that has already ended shows no button", () => {
    render(<SkipList rows={[skip({ ends_on: "2026-11-30" })]} today="2026-12-01" />);
    expect(screen.queryByRole("button", { name: "Bring back" })).toBeNull();
  });

  it("topic skips show their label, after hooks", () => {
    render(<SkipList rows={[skip({ id: "t", dimension: "topic", value: "lifestyle-inflation", total: 9 }), skip({})]} today="2026-11-20" />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("Hook: Promise");
    expect(items[1]).toContain("Topic: How lifestyle inflation affects career flexibility");
  });

  it("says so when nothing is skipped", () => {
    render(<SkipList rows={[]} />);
    expect(screen.getByText("Nothing is being skipped.")).toBeInTheDocument();
  });
});
