import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import OptionalityMeter from "./OptionalityMeter";

describe("OptionalityMeter", () => {
  it("reached: shows the rounded percent, the month, and a bar of that width", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "reached", month: "2033-03", progress: 0.384, cashFlowAtOptionality: 5000 }} />);
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByText("Mar '33")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "38");
  });

  it("no-goal links to Settings and shows no percent", () => {
    render(<OptionalityMeter goalUSD={0} status={{ kind: "no-goal" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("no-amplicons links to Amplicons", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "no-amplicons" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/amplicons");
  });

  it("not-reached names the horizon", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "not-reached", horizonYears: 30 }} />);
    expect(screen.getByText(/30 years/)).toBeInTheDocument();
  });
});
