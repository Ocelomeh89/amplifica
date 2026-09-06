import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalPanel from "./GlobalPanel";
import { DEFAULT_GLOBALS } from "@/lib/compare/defaults";

describe("GlobalPanel", () => {
  it("edits the monthly contribution without disturbing the rest", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/monthly contribution/i), {
      target: { value: "3000" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.capital.monthly).toBe(3000);
    expect(next.capital.lumpSum).toBe(DEFAULT_GLOBALS.capital.lumpSum);
    expect(next.tax).toEqual(DEFAULT_GLOBALS.tax);
  });

  it("takes percentages as whole numbers and stores them as decimals", () => {
    // The engine wants 0.04; a human types 4. Getting this backwards makes a
    // 4% yield run at 400% and everything still renders.
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/inflation/i), { target: { value: "2.5" } });
    expect(onChange.mock.calls[0][0].inflationPct).toBeCloseTo(0.025, 9);
  });

  it("switches scenario", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scenario/i), { target: { value: "bull" } });
    expect(onChange.mock.calls[0][0].scenario).toBe("bull");
  });

  it("toggles the real estate professional flag", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/real estate professional/i));
    expect(onChange.mock.calls[0][0].tax.realEstateProfessional).toBe(true);
  });
});
