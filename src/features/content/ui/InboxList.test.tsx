import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import InboxList from "./InboxList";
import type { ContentIdea } from "@/shared/supabase/database.types";

const likeIdea = vi.fn((_fd: FormData) => Promise.resolve());
vi.mock("@/features/content/data/actions", () => ({
  likeIdea: (fd: FormData) => likeIdea(fd),
  passIdea: vi.fn(),
}));

function idea(id: string): ContentIdea {
  return {
    id,
    user_id: "u1",
    source_id: null,
    format: "reel",
    title: `title ${id}`,
    hook: `hook ${id}`,
    hook_alt: null,
    belief_attacked: "",
    value_to_listener: "",
    why_it_stops: "",
    outline: [],
    quote: "",
    quote_ref: "",
    pillar: "",
    hook_type: "",
    chain_id: null,
    score: 0.5,
    batch_date: "2026-09-17",
    status: "inbox",
    queue_rank: null,
    feedback_reason: null,
    feedback_at: null,
    clickup_task_id: null,
    created_at: "2026-09-17T11:00:00Z",
    updated_at: "2026-09-17T11:00:00Z",
  };
}

const focusedId = () =>
  document.querySelector("article.border-purple")?.getAttribute("data-idea-id");

describe("InboxList keyboard", () => {
  beforeEach(() => likeIdea.mockClear());

  it("j and k move focus, l likes the focused idea", async () => {
    render(<InboxList ideas={[idea("a"), idea("b"), idea("c")]} sourceUrls={{}} siblingsById={{}} />);
    expect(focusedId()).toBe("a");
    fireEvent.keyDown(window, { key: "j" });
    expect(focusedId()).toBe("b");
    // `l` sets `busy` synchronously, then resolves the mocked action and
    // clears `busy` on a microtask; flush it so that update lands in act().
    await act(async () => {
      fireEvent.keyDown(window, { key: "l" });
    });
    expect(likeIdea).toHaveBeenCalledTimes(1);
    expect((likeIdea.mock.calls[0][0] as FormData).get("id")).toBe("b");
    fireEvent.keyDown(window, { key: "k" });
    expect(focusedId()).toBe("a");
  });

  it("keeps focus at the same position when the focused idea leaves the list", () => {
    const { rerender } = render(
      <InboxList ideas={[idea("a"), idea("b"), idea("c")]} sourceUrls={{}} siblingsById={{}} />
    );
    fireEvent.keyDown(window, { key: "j" });
    expect(focusedId()).toBe("b");
    rerender(<InboxList ideas={[idea("a"), idea("c")]} sourceUrls={{}} siblingsById={{}} />);
    expect(focusedId()).toBe("c");
  });

  it("clamps to the last idea when the list shrinks below the old position", () => {
    const { rerender } = render(
      <InboxList ideas={[idea("a"), idea("b")]} sourceUrls={{}} siblingsById={{}} />
    );
    fireEvent.keyDown(window, { key: "j" });
    rerender(<InboxList ideas={[idea("a")]} sourceUrls={{}} siblingsById={{}} />);
    expect(focusedId()).toBe("a");
  });

  it("ignores keys while typing in an input", () => {
    render(<InboxList ideas={[idea("a")]} sourceUrls={{}} siblingsById={{}} />);
    fireEvent.keyDown(window, { key: "x" });
    const input = screen.getByPlaceholderText(/Why not/);
    fireEvent.keyDown(input, { key: "l" });
    expect(likeIdea).not.toHaveBeenCalled();
  });
});
