import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OptionCard, { UnbuiltCard } from "./OptionCard";
import { DEFAULT_SPECS } from "@/lib/compare/defaults";
import type { ComparisonOption } from "@/lib/compare/run";

const cash = DEFAULT_SPECS.find((s) => s.kind === "cash")!;
const rental = DEFAULT_SPECS.find((s) => s.kind === "rental")!;
const debt = DEFAULT_SPECS.find((s) => s.kind === "debt")!;

describe("OptionCard", () => {
  it("shows the option's label", () => {
    render(<OptionCard spec={cash} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByText(cash.label)).toBeInTheDocument();
  });

  it("toggles the option", () => {
    const onToggle = vi.fn();
    render(<OptionCard spec={cash} enabled onToggle={onToggle} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("edits a rate and keeps the rest of the spec intact", () => {
    const onChange = vi.fn();
    render(<OptionCard spec={debt} enabled onToggle={() => {}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: "8" } });
    const next = onChange.mock.calls[0][0];
    expect(next.ratePct).toBeCloseTo(0.08, 9);
    expect(next.balance).toBe(debt.balance);
    expect(next.kind).toBe("debt");
  });

  it("renders the per-scenario rates for a scenario-driven option", () => {
    render(<OptionCard spec={cash} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByLabelText(/bear/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bull/i)).toBeInTheDocument();
  });

  it("renders the rental's own inputs", () => {
    render(<OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByLabelText(/purchase price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
  });

  it("reports what the option did with the capital when given a result", () => {
    const report = {
      capitalAbsorbed: 100_000,
      capitalIdle: 35_000,
      entryMonth: 17,
    } as ComparisonOption;
    render(
      <OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} report={report} />
    );
    expect(screen.getByText(/35,000/)).toBeInTheDocument();
    expect(screen.getByText(/month 17/)).toBeInTheDocument();
  });

  it("says nothing about capital when there is no result yet", () => {
    render(<OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.queryByText(/sleeve/i)).not.toBeInTheDocument();
  });
});

describe("UnbuiltCard", () => {
  it("names the option and why it is missing, and cannot be enabled", () => {
    render(<UnbuiltCard label="Oil & gas working interest" why="Needs IDC expensing." />);
    expect(screen.getByText(/oil & gas/i)).toBeInTheDocument();
    expect(screen.getByText(/IDC expensing/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
