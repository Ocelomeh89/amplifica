// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PastTestsList from "./PastTestsList";
import type { TestView } from "@/features/content/data/test-lab/test-lab";

const t = (id: string, over: Partial<TestView>): TestView =>
  ({ id, question: `Question ${id}?`, status: "judged", verdict_line: "", conclusion: "", skip_reason: "", error: "", judged_at: null, closed_at: null, created_at: "2026-11-01T00:00:00Z", versions: [], ...over }) as TestView;

describe("PastTestsList", () => {
  it("lists newest first with verdict and conclusion", () => {
    render(
      <PastTestsList
        tests={[
          t("old", { judged_at: "2026-11-02T10:00:00Z", verdict_line: "Ranking won: 2,000 views against 1,100 in the first day.", conclusion: "Ranking won. Use it again." }),
          t("new", { judged_at: "2026-11-12T10:00:00Z", verdict_line: "No clear winner: 1,300 views against 1,100 in the first day." }),
          t("skipped", { status: "skipped", closed_at: "2026-11-08T10:00:00Z", skip_reason: "Not this week" }),
          t("lost", { status: "not_run", closed_at: "2026-11-05T10:00:00Z", error: "No numbers were entered within 14 days." }),
        ]}
      />
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("Question new?");
    expect(items[1]).toContain("Question skipped?");
    expect(items[1]).toContain("Skipped");
    expect(items[2]).toContain("Question lost?");
    expect(items[2]).toContain("Not run");
    expect(items[3]).toContain("Question old?");
    expect(items[3]).toContain("Ranking won: 2,000 views against 1,100 in the first day.");
    expect(items[3]).toContain("Ranking won. Use it again.");
  });
  it("renders nothing when empty", () => {
    const { container } = render(<PastTestsList tests={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
