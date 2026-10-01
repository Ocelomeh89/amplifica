import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FoundContentForm from "./FoundContentForm";

const addFoundContent = vi.fn(async (_fd: FormData): Promise<{ error: string | null; count?: number }> => ({ error: null, count: 2 }));
vi.mock("@/features/content/data/actions", () => ({ addFoundContent: (fd: FormData) => addFoundContent(fd) }));

describe("FoundContentForm", () => {
  it("offers the URL, file, competitor, note, and the three angles", () => {
    render(<FoundContentForm />);
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("File")).toBeInTheDocument();
    expect(screen.getByLabelText("Creator (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Why it caught your eye (optional)")).toBeInTheDocument();
    const angle = screen.getByLabelText("Angle") as HTMLSelectElement;
    expect(Array.from(angle.options).map((o) => o.value)).toEqual(["open", "counterpoint", "twist"]);
  });
  it("submits the fields and reports how many ideas landed", async () => {
    render(<FoundContentForm />);
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com/a" } });
    fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "twist" } });
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText("2 ideas added to the Inbox.")).toBeInTheDocument());
    const fd = addFoundContent.mock.calls[0][0];
    expect(fd.get("url")).toBe("https://example.com/a");
    expect(fd.get("angle")).toBe("twist");
  });
  it("shows the error and keeps the form usable", async () => {
    addFoundContent.mockResolvedValueOnce({ error: "That address is private and can't be read." });
    render(<FoundContentForm />);
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/private/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Generate ideas/ })).not.toBeDisabled();
  });
  it("turns a thrown action into a generic retry message", async () => {
    addFoundContent.mockRejectedValueOnce(new Error("boom"));
    render(<FoundContentForm />);
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument());
  });
});
