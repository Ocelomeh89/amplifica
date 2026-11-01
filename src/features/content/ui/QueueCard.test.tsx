// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QueueCard from "./QueueCard";
import type { ContentIdea } from "@/shared/supabase/database.types";

vi.mock("@/features/content/data/actions", () => ({ archiveIdea: vi.fn(), markPosted: vi.fn(), moveIdea: vi.fn() }));

const idea = {
  id: "i1", user_id: "u1", source_id: null, format: "reel", title: "Title", hook: "A hook", hook_alt: null, belief_attacked: "", value_to_listener: "",
  why_it_stops: "", outline: [], quote: "", quote_ref: "", pillar: "", hook_type: "", chain_id: null, score: 0.5, batch_date: "2026-11-01",
  status: "queued", queue_rank: 1, feedback_reason: null, feedback_at: null, clickup_task_id: null, obsidian_path: null, source_post_id: null,
  created_at: "2026-11-01T11:00:00Z", updated_at: "2026-11-01T11:00:00Z",
} as ContentIdea;

describe("QueueCard", () => {
  it("renders what the page puts in the sharpen slot, and nothing otherwise", () => {
    const { rerender } = render(<QueueCard idea={idea} position={0} total={1} sharpenSlot={<p>SHARPEN SLOT</p>} />);
    expect(screen.getByText("SHARPEN SLOT")).toBeTruthy();
    rerender(<QueueCard idea={idea} position={0} total={1} />);
    expect(screen.queryByText("SHARPEN SLOT")).toBeNull();
  });
});
