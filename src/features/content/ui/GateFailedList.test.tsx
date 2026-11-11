import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GateFailedList from "./GateFailedList";

vi.mock("@/features/content/data/actions", () => ({ archiveIdea: vi.fn() }));

const row = {
  id: "i1",
  title: "Why your 401k is slow",
  format: "reel" as const,
  source: "Plaud: Tuesday walk",
  failed: [{ item: "reader", reason: "Nobody would say that's me." }],
};

describe("GateFailedList", () => {
  it("lists each idea with its reasons in plain words and an Archive button", () => {
    render(<GateFailedList rows={[row]} />);
    expect(screen.getByText("Didn't pass the brand gate")).toBeInTheDocument();
    expect(screen.getByText("Why your 401k is slow")).toBeInTheDocument();
    expect(screen.getByText(/Written for Daniel or Stephen: Nobody would say that's me\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("renders nothing when every idea passed", () => {
    const { container } = render(<GateFailedList rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
