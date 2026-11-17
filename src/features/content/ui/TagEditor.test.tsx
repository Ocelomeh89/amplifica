import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TagEditor from "./TagEditor";
import type { PostTags } from "@/features/content/engine/tags";

vi.mock("@/features/content/data/tag-actions", () => ({ saveTagCorrection: vi.fn() }));

const row: PostTags = {
  hook_type: "question",
  onscreen_text: "none",
  message: "velocity",
  topic: "",
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

describe("TagEditor topic", () => {
  const topics = [
    { slug: "mechanics-of-leverage", label: "The mechanics of leverage", pillar: "physics-of-wealth" as const },
    { slug: "burnout-vs-ambition", label: "Professional burnout versus entrepreneurial ambition", pillar: "w2-advantage" as const },
  ];
  const physics: PostTags = { ...row, message: "physics-of-wealth", topic: "mechanics-of-leverage", tag_locks: [] };

  it("offers the topics of the post's message, with the current one selected", () => {
    const { container } = render(<TagEditor id="p1" row={physics} topics={topics} onDone={() => {}} />);
    const select = container.querySelector('select[name="topic"]') as HTMLSelectElement;
    expect(select.value).toBe("mechanics-of-leverage");
    expect(screen.getByRole("option", { name: "The mechanics of leverage" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Professional burnout versus entrepreneurial ambition" })).toBeNull();
  });

  it("follows the message select when it changes", () => {
    const { container } = render(<TagEditor id="p1" row={physics} topics={topics} onDone={() => {}} />);
    fireEvent.change(container.querySelector('select[name="message"]') as HTMLSelectElement, { target: { value: "w2-advantage" } });
    expect(screen.getByRole("option", { name: "Professional burnout versus entrepreneurial ambition" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "The mechanics of leverage" })).toBeNull();
  });

  it("keeps a stored topic that is no longer in the list visible and selected", () => {
    const { container } = render(<TagEditor id="p1" row={{ ...physics, topic: "old-topic" }} topics={topics} onDone={() => {}} />);
    expect((container.querySelector('select[name="topic"]') as HTMLSelectElement).value).toBe("old-topic");
  });
});
