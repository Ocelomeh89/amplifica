import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TagEditor from "./TagEditor";
import type { PostTags } from "@/features/content/engine/tags";

vi.mock("@/features/content/data/tag-actions", () => ({ saveTagCorrection: vi.fn() }));

const row: PostTags = {
  hook_type: "question",
  onscreen_text: "none",
  message: "velocity",
  cta_type: "save",
  post_style: "talking-head",
  cover_face: null,
  cover_text: null,
  cover_number: null,
  hook_spoken: "",
  hook_onscreen: "",
  tag_confidence: {},
  tag_locks: ["message"],
  tagged_at: "2026-11-01T00:00:00Z",
};

describe("TagEditor", () => {
  it("shows an old canon message as the selected value, marked old, beside the pillars", () => {
    const { container } = render(<TagEditor id="p1" row={row} onDone={() => {}} />);
    const select = container.querySelector('select[name="message"]') as HTMLSelectElement;
    expect(select.value).toBe("velocity");
    expect(screen.getByRole("option", { name: "Velocity (old)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "The W-2 Advantage" })).toBeInTheDocument();
  });
});
