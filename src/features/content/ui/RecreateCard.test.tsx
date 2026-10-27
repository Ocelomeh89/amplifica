import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecreateCard, { type OpenRecreation } from "./RecreateCard";

const pickRecreateOption = vi.fn(async (_fd: FormData): Promise<{ error: string | null; ideaId?: string }> => ({ error: null, ideaId: "i1" }));
const regenerateRecreate = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const retryRecreate = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
vi.mock("@/features/content/data/recreate-actions", () => ({
  pickRecreateOption: (fd: FormData) => pickRecreateOption(fd),
  regenerateRecreate: (fd: FormData) => regenerateRecreate(fd),
  retryRecreate: (fd: FormData) => retryRecreate(fd),
}));

const base: OpenRecreation = {
  id: "r1",
  source_post_id: "p1",
  mode: "same-recipe",
  status: "ready",
  error: "",
  idea_id: null,
  created_at: "2026-10-26T15:04:00Z",
  options: [
    { hook: "Hook one", angle: "Angle one", topic: "Topic one", message: "velocity" },
    { hook: "Hook two", angle: "Angle two", topic: "Topic two", message: "velocity" },
    { hook: "Hook three", angle: "Angle three", topic: "Topic three", message: "velocity" },
  ],
  source: { id: "p1", thumbnail_url: "https://cdn/x.jpg", caption: "Original caption\nmore" },
};

describe("RecreateCard", () => {
  it("pending shows Writing 3 options with when it started", () => {
    render(<RecreateCard item={{ ...base, status: "pending", options: [] }} />);
    expect(screen.getByText(/Writing 3 options/)).toBeInTheDocument();
    expect(screen.getByText(/Started/)).toBeInTheDocument();
  });

  it("ready shows 3 options, each with a topic and its own Use this button", () => {
    render(<RecreateCard item={base} />);
    for (const t of ["Hook one", "Hook two", "Hook three"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByText("Topic two")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use this" })).toHaveLength(3);
  });

  it("adjacent options show their message as a chip", () => {
    render(<RecreateCard item={{ ...base, mode: "adjacent", options: base.options.map((o, i) => ({ ...o, message: i === 0 ? "scoreboard" : "forced-sale" })) }} />);
    expect(screen.getByText("Scoreboard")).toBeInTheDocument();
    expect(screen.getAllByText("Forced sale")).toHaveLength(2);
  });

  it("shows the source thumbnail and the mode label", () => {
    render(<RecreateCard item={base} />);
    expect(screen.getByRole("img", { name: /Original caption/ })).toHaveAttribute("src", "https://cdn/x.jpg");
    expect(screen.getByText("Same recipe, new topic")).toBeInTheDocument();
  });

  it("picks the option whose button was pressed and confirms", async () => {
    render(<RecreateCard item={base} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Use this" })[1]);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/added to your Inbox/i));
    const fd = pickRecreateOption.mock.calls[0][0];
    expect(fd.get("id")).toBe("r1");
    expect(fd.get("index")).toBe("1");
  });

  it("failed shows the reason in an alert and a Try again button", async () => {
    render(<RecreateCard item={{ ...base, status: "failed", error: "Timed out", options: [] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Timed out");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(retryRecreate).toHaveBeenCalled());
    expect(retryRecreate.mock.calls[0][0].get("id")).toBe("r1");
  });

  it("Regenerate asks Replace these 3? before calling the action", async () => {
    render(<RecreateCard item={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.getByText("Replace these 3?")).toBeInTheDocument();
    expect(regenerateRecreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(regenerateRecreate).toHaveBeenCalled());
  });

  it("Keep closes the confirmation without calling the action", () => {
    regenerateRecreate.mockClear();
    render(<RecreateCard item={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText("Replace these 3?")).toBeNull();
    expect(regenerateRecreate).not.toHaveBeenCalled();
  });
});
