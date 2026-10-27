// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TagChips from "./TagChips";
import type { PostTags } from "@/features/content/engine/tags";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("window=30&tag=hook_type:paradox") }));

const row = (over: Partial<PostTags> = {}): PostTags & { caption: string } => ({
  hook_type: "", onscreen_text: "", message: "", cta_type: "", post_style: "",
  cover_face: null, cover_text: null, cover_number: null, hook_spoken: "", hook_onscreen: "",
  tag_confidence: {}, tag_locks: [], tagged_at: null, caption: "short caption", ...over,
});

describe("TagChips", () => {
  it("links a chip to the current params plus its tag, keeping the others", () => {
    render(<TagChips row={row({ post_style: "animation", hook_type: "paradox" })} />);
    const href = screen.getByRole("link", { name: /Animation/ }).getAttribute("href")!;
    const q = new URLSearchParams(href.slice(1));
    expect(q.get("window")).toBe("30");
    expect(q.getAll("tag")).toEqual(["hook_type:paradox", "post_style:animation"]);
  });

  it("with a basePath, a chip links to that page filtered by its own tag only", () => {
    render(<TagChips row={row({ post_style: "animation" })} basePath="/content/performance" />);
    const href = screen.getByRole("link", { name: /Animation/ }).getAttribute("href")!;
    expect(href.startsWith("/content/performance?")).toBe(true);
    expect(new URLSearchParams(href.split("?")[1]).getAll("tag")).toEqual(["post_style:animation"]);
  });

  it("fades a low-confidence chip with a question mark and marks a locked one", () => {
    render(
      <TagChips row={row({ message: "velocity", hook_type: "question", tag_confidence: { message: 0.3 }, tag_locks: ["hook_type"] })} />
    );
    expect(screen.getByRole("link", { name: /Velocity/ }).textContent).toContain("?");
    expect(screen.getByRole("link", { name: /Question/ }).querySelector("[aria-label='corrected']")).not.toBeNull();
  });

  it("says tagging is next Monday on an untagged row but still shows caption length", () => {
    render(<TagChips row={row()} />);
    expect(screen.getByText("tagging next Monday")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Short caption/ })).toBeTruthy();
  });
});
