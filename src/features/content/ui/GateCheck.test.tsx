import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GateCheck from "./GateCheck";

const result = { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [] };

describe("GateCheck", () => {
  it("ticks every item for a pass and names both pillars", () => {
    render(<GateCheck gate={{ result, rewritten: false, checked_at: "2026-11-10T12:00:00Z" }} original={null} />);
    expect(screen.getAllByText("✓").length).toBe(11);
    expect(screen.getByText(/The W-2 Advantage/)).toBeInTheDocument();
    expect(screen.getByText(/The Numbers/)).toBeInTheDocument();
  });

  it("says when the gate rewrote the idea and shows the original hook", () => {
    render(<GateCheck gate={{ result, rewritten: true, checked_at: "x" }} original={{ hook: "The old hook" }} />);
    expect(screen.getByText("Rewritten by the brand gate")).toBeInTheDocument();
    expect(screen.getByText(/The old hook/)).toBeInTheDocument();
  });

  it("marks failed items with their reason", () => {
    const failed = { ...result, verdict: "fail", failed: [{ item: "downside", reason: "No risk named." }] };
    render(<GateCheck gate={{ result: failed, rewritten: false, checked_at: "x" }} original={null} />);
    expect(screen.getByText(/No risk named\./)).toBeInTheDocument();
  });

  it("renders nothing for an idea from before the gate", () => {
    const { container } = render(<GateCheck gate={null} original={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
