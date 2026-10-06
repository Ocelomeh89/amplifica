import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingSourcesStrip from "./PendingSourcesStrip";
import type { ContentSource } from "@/shared/supabase/database.types";

vi.mock("@/features/content/data/actions", () => ({ allowSource: vi.fn(), denySource: vi.fn() }));

function src(over: Partial<ContentSource>): ContentSource {
  return {
    id: "s1", user_id: "u", kind: "plaud", external_id: "f1", title: "Walk with Jackie", url: null,
    occurred_at: "2026-09-30T20:42:00Z", status: "pending", requested_at: null, mined_at: null,
    meta: {}, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("PendingSourcesStrip", () => {
  it("shows when the recording happened, date and time", () => {
    render(<PendingSourcesStrip sources={[src({})]} />);
    expect(screen.getByText("Sep 30, 3:42 PM")).toBeInTheDocument();
  });
  it("falls back to when the row was created if occurred_at is missing", () => {
    render(<PendingSourcesStrip sources={[src({ occurred_at: null, created_at: "2026-10-01T15:10:00Z" })]} />);
    expect(screen.getByText("Oct 1, 10:10 AM")).toBeInTheDocument();
  });
  it("renders nothing when there are none", () => {
    const { container } = render(<PendingSourcesStrip sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
