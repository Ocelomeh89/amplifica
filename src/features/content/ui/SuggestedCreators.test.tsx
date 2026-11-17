// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SuggestedCreators from "./SuggestedCreators";
import type { SuggestionCard } from "@/features/content/data/discovery/discovery";

vi.mock("@/features/content/data/discovery/discovery-actions", () => ({ addSuggestedAction: vi.fn(), declineSuggestedAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const card = (over: Partial<SuggestionCard> = {}): SuggestionCard => ({
  creatorId: "11111111-1111-4111-8111-111111111111",
  username: "ericsfinancials",
  followersLine: "48k followers, 6x yours",
  reader: "daniel",
  reason: "The posts speak to a W-2 saver behind on retirement.",
  evidence: ["I am 38 and behind on retirement", "Max out your 401k first"],
  best: [{ url: "https://www.instagram.com/reel/abc/", multiple: 4.2 }],
  foundVia: "related to ericsfinancials",
  ...over,
});

describe("SuggestedCreators", () => {
  it("shows the follower line, the reader, both quotes, how it was found, and Add and Decline", () => {
    render(<SuggestedCreators suggestions={[card()]} />);
    expect(screen.getByText("48k followers, 6x yours")).toBeTruthy();
    expect(screen.getByText("Speaks to Daniel")).toBeTruthy();
    expect(screen.getByText(/I am 38 and behind on retirement/)).toBeTruthy();
    expect(screen.getByText(/Max out your 401k first/)).toBeTruthy();
    expect(screen.getByText("related to ericsfinancials")).toBeTruthy();
    expect(screen.getByRole("link", { name: "@ericsfinancials" }).getAttribute("href")).toBe("https://www.instagram.com/ericsfinancials/");
    expect(screen.getByRole("link", { name: /4.2x their typical views/ }).getAttribute("href")).toBe("https://www.instagram.com/reel/abc/");
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("Decline cannot be sent with an empty reason; a chip fills the box", () => {
    render(<SuggestedCreators suggestions={[card({ reader: "stephen" })]} />);
    expect(screen.getByText("Speaks to Stephen")).toBeTruthy();
    const decline = screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement;
    expect(decline.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "too salesy" }));
    expect((screen.getByLabelText("Why not?") as HTMLInputElement).value).toBe("too salesy");
    expect(decline.disabled).toBe(false);
    for (const chip of ["wrong audience", "not my lane", "too big or too small"]) expect(screen.getByRole("button", { name: chip })).toBeTruthy();
  });

  it("with no suggestions it says so and nothing else", () => {
    render(<SuggestedCreators suggestions={[]} />);
    expect(screen.getByText("No suggestions waiting.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a suggestion with no best Reel shows no Reel link", () => {
    render(<SuggestedCreators suggestions={[card({ best: [] })]} />);
    expect(screen.queryByText(/typical views/)).toBeNull();
  });
});
