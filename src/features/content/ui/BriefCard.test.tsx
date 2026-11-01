// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BriefCard from "./BriefCard";
import type { BriefView } from "@/features/content/data/today";

const swapBrief = vi.fn(async (_fd: FormData) => ({ error: null as string | null, message: "A new test is on the way." }));
const skipBriefAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
vi.mock("@/features/content/data/today-actions", () => ({
  swapBrief: (fd: FormData) => swapBrief(fd),
  skipBriefAction: (fd: FormData) => skipBriefAction(fd),
}));
vi.mock("@/features/content/data/actions", () => ({ markPosted: vi.fn(async () => ({ error: null })) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const base: BriefView = {
  id: "e1",
  idea_id: "i1",
  day: "2026-10-27",
  slot: 1,
  kind: "proposed",
  moment: "",
  variable: "hook_type",
  value: "belief-attacking",
  recipe: { hook_type: "belief-attacking", onscreen_text: "none", cta_type: "save", post_style: "talking-head-text", cover: "face", message: "velocity", topic: "401k", control: "question" },
  reason: "Belief attacking won 3 of 4 Reels in the last 90 days.",
  status: "open",
  post_id: null,
  judge_at: null,
  verdict: null,
  judge_metrics: {},
  judged_at: null,
  competitor_post_id: null,
  competitor: null,
  created_at: "2026-10-27T10:00:00Z",
  idea: { id: "i1", title: "T", hook: "Your 401k is slow on purpose.", outline: [{ beat: "Say the line." }, { beat: "Pause." }, { beat: "Give the number." }], status: "queued" },
  post: null,
};

describe("BriefCard", () => {
  it("shows the recipe, hook, each say line, the test with its control, what is held still and the reason", () => {
    render(<BriefCard brief={base} />);
    expect(screen.getByText("Your 401k is slow on purpose.")).toBeTruthy();
    expect(screen.getByText("Say the line.")).toBeTruthy();
    expect(screen.getByText(/Hook type: Belief attacking instead of Question/)).toBeTruthy();
    const held = screen.getByText(/Held still:/).parentElement!.textContent!;
    expect(held).toContain("Post style: Talking head text");
    expect(held).toContain("Message: Velocity");
    expect(held).not.toContain("Hook type");
    expect(screen.getByText(/won 3 of 4 Reels/)).toBeTruthy();
  });

  it("offers the three actions while open and runs Swap and Skip", async () => {
    render(<BriefCard brief={base} />);
    expect(screen.getByRole("button", { name: "Mark as posted" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap the test" }));
    await waitFor(() => expect(swapBrief).toHaveBeenCalled());
    expect(await screen.findByText("A new test is on the way.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(skipBriefAction).toHaveBeenCalled());
  });

  it("shows the judgment date once posted and no actions", () => {
    render(<BriefCard brief={{ ...base, status: "posted", post_id: "p1", judge_at: "2026-11-03T15:00:00Z" }} />);
    expect(screen.getByText(/Judged on Nov 3/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("shows the verdict and figures once judged", () => {
    render(
      <BriefCard
        brief={{ ...base, status: "judged", verdict: "won", post_id: "p1", post: { id: "p1", url: "u" }, judge_metrics: { multiplier: 1.6, day: 7, mode: "matched", n_saves: 1.2, n_watch: 0.9 } }}
      />
    );
    expect(screen.getByRole("status").textContent).toContain("Won.");
    expect(screen.getByRole("status").textContent).toContain("Views 1.60×");
    expect(screen.getByRole("status").textContent).toContain("Watch time 0.90×");
    expect(screen.getByRole("link", { name: "See the post" }).getAttribute("href")).toBe("/content/performance/p1");
  });

  it("labels a moment brief with the moment", () => {
    render(<BriefCard brief={{ ...base, slot: 3, kind: "moment", moment: "flying out at 6am" }} />);
    expect(screen.getByText("From today")).toBeTruthy();
    expect(screen.getByText(/flying out at 6am/)).toBeTruthy();
  });

  it("words a topic test without a control", () => {
    render(<BriefCard brief={{ ...base, variable: "topic", value: "new", recipe: { ...base.recipe, control: "" } }} />);
    expect(screen.getByText(/A topic the last 90 days have not covered/)).toBeTruthy();
  });

  it("a competitor brief credits and links the original, with the belief it pushes", () => {
    render(
      <BriefCard
        brief={{
          ...base,
          slot: 2,
          kind: "competitor",
          variable: "source",
          value: "competitor-rebuttal",
          recipe: { ...base.recipe, control: "own" },
          competitor_post_id: "cp1",
          competitor: { username: "micro.investing", url: "https://www.instagram.com/p/A1/", multiple: 3.4, thin: true, pushes_belief: "max out your 401k", format_note: null },
        }}
      />
    );
    const link = screen.getByRole("link", { name: /Inspired by @micro.investing, 3.4× their typical views/ });
    expect(link.getAttribute("href")).toBe("https://www.instagram.com/p/A1/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Pushes: max out your 401k")).toBeTruthy();
    expect(screen.getByText("Thin baseline")).toBeTruthy();
    expect(screen.getByText("Source: rebuttal of a competitor post instead of your own topic")).toBeTruthy();
  });

  it("words a take and a new-format test", () => {
    const competitor = { username: "ericsfinancials", url: "u", multiple: 5, thin: false, pushes_belief: null, format_note: "split screen, two speakers" };
    const { unmount } = render(<BriefCard brief={{ ...base, kind: "competitor", variable: "source", value: "competitor-take", competitor }} />);
    expect(screen.getByText("Source: a competitor's topic with your take instead of your own topic")).toBeTruthy();
    unmount();
    render(<BriefCard brief={{ ...base, kind: "competitor", variable: "post_style", value: "new-format", recipe: { ...base.recipe, post_style: "new-format", control: "talking-head" }, competitor }} />);
    expect(screen.getByText("Post style: new format from @ericsfinancials instead of Talking head")).toBeTruthy();
    expect(screen.getByText("New format: split screen, two speakers")).toBeTruthy();
  });
});
