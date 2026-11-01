// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SharpenPanel from "./SharpenPanel";
import type { SharpenRow } from "@/features/content/data/sharpen";

const startSharpenAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null, message: "3 rewrites on the way. About a minute." }));
const pickSharpenAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const retrySharpenAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const cancelSharpenAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
vi.mock("@/features/content/data/sharpen-actions", () => ({
  startSharpenAction: (fd: FormData) => startSharpenAction(fd),
  pickSharpenAction: (fd: FormData) => pickSharpenAction(fd),
  retrySharpenAction: (fd: FormData) => retrySharpenAction(fd),
  cancelSharpenAction: (fd: FormData) => cancelSharpenAction(fd),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const option = (n: number) => ({
  title: `Title ${n}`,
  hook: `Hook ${n}`,
  hook_type: "belief-attacking" as const,
  belief_attacked: "b",
  value_to_listener: "v",
  why_it_stops: "w",
  outline: ["a", "b", "c"],
  what_changed: `Changed ${n}`,
});
const row = (over: Partial<SharpenRow> = {}): SharpenRow => ({
  id: "s1", idea_id: "i1", note_id: "n1", status: "ready", options: [option(1), option(2), option(3)], error: "", chips: [], text: "", created_at: "2026-11-01T14:50:00Z", ...over,
});

describe("SharpenPanel", () => {
  it("offers a Sharpen button that opens the four chips, a text box and Sharpen", () => {
    render(<SharpenPanel ideaId="i1" sharpen={null} blocked={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sharpen" }));
    for (const chip of ["Hook too weak", "Too vague", "No numbers", "No opinion"]) expect(screen.getByRole("button", { name: chip })).toBeTruthy();
    expect(screen.getByPlaceholderText("Anything else?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("sends the chosen chips and the text with the idea id", async () => {
    render(<SharpenPanel ideaId="i1" sharpen={null} blocked={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sharpen" }));
    fireEvent.click(screen.getByRole("button", { name: "Hook too weak" }));
    fireEvent.click(screen.getByRole("button", { name: "No numbers" }));
    fireEvent.change(screen.getByPlaceholderText("Anything else?"), { target: { value: "too generic" } });
    fireEvent.click(screen.getByRole("button", { name: "Sharpen it" }));
    await waitFor(() => expect(startSharpenAction).toHaveBeenCalled());
    const fd = startSharpenAction.mock.calls[0][0];
    expect(fd.get("id")).toBe("i1");
    expect(fd.getAll("chips")).toEqual(["Hook too weak", "No numbers"]);
    expect(fd.get("text")).toBe("too generic");
  });

  it("shows the reason instead of the button when the idea is blocked", () => {
    render(<SharpenPanel ideaId="i1" sharpen={null} blocked="Already drafted." />);
    expect(screen.getByText("Already drafted.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sharpen" })).toBeNull();
  });

  it("pending says it is working", () => {
    render(<SharpenPanel ideaId="i1" sharpen={row({ status: "pending", options: [] })} blocked={null} />);
    expect(screen.getByText("Sharpening… about a minute.")).toBeTruthy();
  });

  it("failed says why and offers Try again", async () => {
    render(<SharpenPanel ideaId="i1" sharpen={row({ status: "failed", options: [], error: "Timed out" })} blocked={null} />);
    expect(screen.getByText("Couldn't sharpen: Timed out")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(retrySharpenAction).toHaveBeenCalled());
    expect(retrySharpenAction.mock.calls[0][0].get("id")).toBe("s1");
  });

  it("ready shows three rewrites with what changed, each with Pick, plus Try again and Cancel", async () => {
    render(<SharpenPanel ideaId="i1" sharpen={row()} blocked={null} />);
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`Hook ${n}`)).toBeTruthy();
      expect(screen.getByText(`Changed ${n}`)).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: "Pick" })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Pick" })[1]);
    await waitFor(() => expect(pickSharpenAction).toHaveBeenCalled());
    const fd = pickSharpenAction.mock.calls[0][0];
    expect([fd.get("id"), fd.get("index")]).toEqual(["s1", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelSharpenAction).toHaveBeenCalled());
  });

  it("shows an action error", async () => {
    pickSharpenAction.mockResolvedValueOnce({ error: "Already drafted." });
    render(<SharpenPanel ideaId="i1" sharpen={row()} blocked={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pick" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Already drafted.");
  });
});
