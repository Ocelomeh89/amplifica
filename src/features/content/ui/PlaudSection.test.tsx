import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PlaudSection from "./PlaudSection";
import type { ContentSource } from "@/shared/supabase/database.types";

vi.mock("@/features/content/data/actions", () => ({ requestMining: vi.fn() }));

function src(over: Partial<ContentSource>): ContentSource {
  return {
    id: "s", user_id: "u", kind: "plaud", external_id: "f1", title: "Walk with Jackie", url: null,
    occurred_at: "2026-09-16T20:00:00Z", status: "pending", requested_at: null, mined_at: null,
    meta: { has_highlights: true, duration_s: 1500 }, created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
    ...over,
  };
}

describe("PlaudSection", () => {
  it("shows the button for a pending recording with its highlights and minutes", () => {
    render(<PlaudSection sources={[src({})]} lastSweep={null} />);
    expect(screen.getByRole("button", { name: "Mine this" })).toBeInTheDocument();
    expect(screen.getByText("highlights")).toBeInTheDocument();
    expect(screen.getByText("25 min")).toBeInTheDocument();
    expect(screen.getByText(/Last sweep: never/)).toBeInTheDocument();
  });
  it("hides the button and labels denied, mined, and requested rows", () => {
    render(
      <PlaudSection
        sources={[
          src({ id: "a", status: "denied", requested_at: "2026-09-16T00:00:00Z" }),
          src({ id: "b", status: "mined", mined_at: "2026-09-16T00:00:00Z" }),
          src({ id: "c", status: "allowed", requested_at: "2026-09-16T00:00:00Z" }),
        ]}
        lastSweep="2026-09-17T11:00:00Z"
      />
    );
    expect(screen.queryByRole("button", { name: "Mine this" })).toBeNull();
    expect(screen.getByText("denied")).toBeInTheDocument();
    expect(screen.getByText("mined")).toBeInTheDocument();
    expect(screen.getByText("requested")).toBeInTheDocument();
  });
  it("says when there are none", () => {
    render(<PlaudSection sources={[]} lastSweep={null} />);
    expect(screen.getByText(/No Plaud recordings seen yet/)).toBeInTheDocument();
  });
});
