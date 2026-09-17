import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IdeaCard from "./IdeaCard";
import type { ContentIdea } from "@/shared/supabase/database.types";

vi.mock("@/features/content/data/actions", () => ({
  likeIdea: vi.fn(),
  passIdea: vi.fn(),
}));

const idea: ContentIdea = {
  id: "i1",
  user_id: "u1",
  source_id: "s1",
  format: "reel",
  title: "A W-2 is a runway, not a cage",
  hook: "I took a new W-2 job this month.",
  hook_alt: "The fastest way out of a paycheck is a bigger paycheck.",
  belief_attacked: "You have to quit to build FI",
  value_to_listener: "A rule for raises",
  why_it_stops: "Contradicts the freedom pitch",
  outline: [{ beat: "Offer letter on screen" }],
  quote: "every extra dollar goes to the machine",
  quote_ref: "Joe/Miguel 2026-09-17 ~00:12:40",
  pillar: "optionality",
  hook_type: "belief-attacking",
  chain_id: "c1",
  score: 0.82,
  batch_date: "2026-09-17",
  status: "inbox",
  queue_rank: null,
  feedback_reason: null,
  feedback_at: null,
  clickup_task_id: null,
  created_at: "2026-09-17T11:00:00Z",
  updated_at: "2026-09-17T11:00:00Z",
};

describe("IdeaCard", () => {
  it("shows the hook, the three why lines, the quote, and the source link", () => {
    render(
      <IdeaCard idea={idea} sourceUrl="https://notes.granola.ai/d/x" siblings={[{ id: "i2", format: "story" }]} />
    );
    expect(screen.getByText("I took a new W-2 job this month.")).toBeInTheDocument();
    expect(screen.getByText(/You have to quit to build FI/)).toBeInTheDocument();
    expect(screen.getByText(/A rule for raises/)).toBeInTheDocument();
    expect(screen.getByText(/Contradicts the freedom pitch/)).toBeInTheDocument();
    expect(screen.getByText(/every extra dollar goes to the machine/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Joe\/Miguel/ })).toHaveAttribute("href", "https://notes.granola.ai/d/x");
    expect(screen.getByText("Story")).toBeInTheDocument();
  });

  it("has Like and Pass buttons", () => {
    render(<IdeaCard idea={idea} sourceUrl={null} siblings={[]} />);
    expect(screen.getByRole("button", { name: /Like/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pass/ })).toBeInTheDocument();
  });
});
