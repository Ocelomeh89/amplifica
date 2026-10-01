import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FoundSourcesList from "./FoundSourcesList";
import { foundBadge } from "@/features/content/engine/found";

const regenerateFound = vi.fn(async (_fd: FormData): Promise<{ error: string | null; count?: number }> => ({ error: null, count: 3 }));
vi.mock("@/features/content/data/actions", () => ({ regenerateFound: (fd: FormData) => regenerateFound(fd) }));

const sources = [
  { id: "s1", kind: "url", title: "Their post", url: "https://example.com/post", status: "mined", meta: { angle: "counterpoint", note: "old note" } },
  { id: "s2", kind: "upload", title: "talk.pdf", url: null, status: "mined", meta: {} },
];

describe("FoundSourcesList", () => {
  it("lists found sources with their angle badge", () => {
    render(<FoundSourcesList sources={sources} />);
    expect(screen.getByText("Their post")).toBeInTheDocument();
    expect(screen.getByText(foundBadge("url", { angle: "counterpoint" })!)).toBeInTheDocument();
    expect(screen.getByText("talk.pdf")).toBeInTheDocument();
  });
  it("says so when there are none", () => {
    render(<FoundSourcesList sources={[]} />);
    expect(screen.getByText(/Nothing pasted in yet/)).toBeInTheDocument();
  });
  it("submits the source id with the new angle and note", async () => {
    render(<FoundSourcesList sources={sources} />);
    // hidden: true because the buttons sit inside a closed <details>.
    const form = screen.getAllByRole("button", { name: "Generate again", hidden: true })[0].closest("form")!;
    fireEvent.change(form.querySelector("select[name=angle]")!, { target: { value: "twist" } });
    fireEvent.submit(form);
    await waitFor(() => expect(regenerateFound).toHaveBeenCalled());
    const fd = regenerateFound.mock.calls[0][0];
    expect(fd.get("id")).toBe("s1");
    expect(fd.get("angle")).toBe("twist");
    await waitFor(() => expect(screen.getByText("3 ideas added to the Inbox.")).toBeInTheDocument());
  });
});
