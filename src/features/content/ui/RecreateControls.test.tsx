import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecreateControls from "./RecreateControls";

type Result = { error: string | null; message?: string; liveId?: string };
const startRecreate = vi.fn(async (_fd: FormData): Promise<Result> => ({ error: null, message: "3 options on the way to your Inbox." }));
vi.mock("@/features/content/data/recreate-actions", () => ({ startRecreate: (fd: FormData) => startRecreate(fd) }));

const NONE = { "same-recipe": null, adjacent: null };

describe("RecreateControls", () => {
  it("hides the buttons for an untagged post", () => {
    render(<RecreateControls postId="p1" tagged={false} live={NONE} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Tag this post to recreate it/)).toBeInTheDocument();
  });

  it("shows both buttons for a tagged post", () => {
    render(<RecreateControls postId="p1" tagged live={NONE} />);
    expect(screen.getByRole("button", { name: "Same recipe, new topic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjacent topic" })).toBeInTheDocument();
  });

  it("a live card shows a link to the Inbox instead of the button", () => {
    render(<RecreateControls postId="p1" tagged live={{ "same-recipe": { id: "r1", status: "ready" }, adjacent: null }} />);
    expect(screen.queryByRole("button", { name: "Same recipe, new topic" })).toBeNull();
    expect(screen.getByRole("link", { name: /options in your Inbox/ })).toHaveAttribute("href", "/content");
    expect(screen.getByRole("button", { name: "Adjacent topic" })).toBeInTheDocument();
  });

  it("submits the post and mode, then confirms in a status region", async () => {
    render(<RecreateControls postId="p1" tagged live={NONE} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjacent topic" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 options on the way to your Inbox."));
    const fd = startRecreate.mock.calls[0][0];
    expect(fd.get("postId")).toBe("p1");
    expect(fd.get("mode")).toBe("adjacent");
  });

  it("disables the buttons while the action runs", async () => {
    let release: (r: Result) => void = () => {};
    startRecreate.mockImplementationOnce(() => new Promise<Result>((r) => (release = r)));
    render(<RecreateControls postId="p1" tagged live={NONE} />);
    fireEvent.click(screen.getByRole("button", { name: "Same recipe, new topic" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Adjacent topic" })).toBeDisabled());
    release({ error: null, message: "3 options on the way to your Inbox." });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  it("shows an error in an alert", async () => {
    startRecreate.mockResolvedValueOnce({ error: "That's 10 recreations today. Try again tomorrow." });
    render(<RecreateControls postId="p1" tagged live={NONE} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjacent topic" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That's 10 recreations today."));
  });
});
