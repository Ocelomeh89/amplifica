import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FoundContentForm from "./FoundContentForm";

const addFoundContent = vi.fn(async (_fd: FormData): Promise<{ error: string | null; count?: number; message?: string }> => ({ error: null, count: 2 }));
const queueFoundContent = vi.fn(async (_fd: FormData): Promise<{ error: string | null; count?: number; message?: string }> => ({
  error: null,
  message: "Added to the queue. Ideas come with Monday's run, or run /content-found now.",
}));
vi.mock("@/features/content/data/actions", () => ({
  addFoundContent: (fd: FormData) => addFoundContent(fd),
  queueFoundContent: (fd: FormData) => queueFoundContent(fd),
}));

describe("FoundContentForm with an API key", () => {
  it("offers the URL, file, creator, note, and the three angles", () => {
    render(<FoundContentForm canGenerate />);
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("File")).toBeInTheDocument();
    expect(screen.getByLabelText("Creator (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Why it caught your eye (optional)")).toBeInTheDocument();
    const angle = screen.getByLabelText("Angle") as HTMLSelectElement;
    expect(Array.from(angle.options).map((o) => o.value)).toEqual(["open", "counterpoint", "twist"]);
    expect((screen.getByLabelText("File") as HTMLInputElement).accept).toContain(".pdf");
  });
  it("submits the fields and reports how many ideas landed", async () => {
    render(<FoundContentForm canGenerate />);
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com/a" } });
    fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "twist" } });
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText("2 ideas added to the Inbox.")).toBeInTheDocument());
    const fd = addFoundContent.mock.calls[0][0];
    expect(fd.get("url")).toBe("https://example.com/a");
    expect(fd.get("angle")).toBe("twist");
    expect(queueFoundContent).not.toHaveBeenCalled();
  });
  it("shows the error and keeps the form usable", async () => {
    addFoundContent.mockResolvedValueOnce({ error: "That address is private and can't be read." });
    render(<FoundContentForm canGenerate />);
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/private/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Generate ideas/ })).not.toBeDisabled();
  });
  it("turns a thrown action into a generic retry message", async () => {
    addFoundContent.mockRejectedValueOnce(new Error("boom"));
    render(<FoundContentForm canGenerate />);
    fireEvent.submit(screen.getByRole("button", { name: /Generate ideas/ }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument());
  });
});

describe("FoundContentForm without an API key (queue mode)", () => {
  it("says it saves to a queue, and takes text files only", () => {
    render(<FoundContentForm canGenerate={false} />);
    expect(screen.getByRole("button", { name: "Add to queue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate ideas/ })).toBeNull();
    expect(screen.getByText(/queue/i, { selector: "p" })).toBeInTheDocument();
    const accept = (screen.getByLabelText("File") as HTMLInputElement).accept;
    expect(accept).toContain(".txt");
    expect(accept).not.toContain(".pdf");
  });
  it("submits to the queue action and shows its message", async () => {
    queueFoundContent.mockClear();
    addFoundContent.mockClear();
    render(<FoundContentForm canGenerate={false} />);
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://example.com/a" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add to queue" }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/Added to the queue/)).toBeInTheDocument());
    expect(queueFoundContent.mock.calls[0][0].get("url")).toBe("https://example.com/a");
    expect(addFoundContent).not.toHaveBeenCalled();
  });
  it("shows a queue error", async () => {
    queueFoundContent.mockResolvedValueOnce({ error: "Already mined. To get new ideas from it, run /content-found with the link and a new angle." });
    render(<FoundContentForm canGenerate={false} />);
    fireEvent.submit(screen.getByRole("button", { name: "Add to queue" }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/Already mined/)).toBeInTheDocument());
  });
});
