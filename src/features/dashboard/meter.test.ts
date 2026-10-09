import { describe, it, expect } from "vitest";
import { optionalityProgress, meterColor } from "./meter";

describe("optionalityProgress", () => {
  it("is current ÷ cash flow at optionality", () => {
    expect(optionalityProgress(1500, 6000)).toBeCloseTo(0.25, 10);
  });
  it("clamps to 0–1", () => {
    expect(optionalityProgress(9000, 6000)).toBe(1);
    expect(optionalityProgress(-5, 6000)).toBe(0);
  });
  it("a zero or invalid denominator reads 100% if anything is flowing, else 0%", () => {
    expect(optionalityProgress(100, 0)).toBe(1);
    expect(optionalityProgress(0, 0)).toBe(0);
    expect(optionalityProgress(100, Number.NaN)).toBe(1);
  });
});

describe("meterColor", () => {
  it("runs red at 0% to green at 100% through amber", () => {
    expect(meterColor(0)).toBe("hsl(0 70% 45%)");
    expect(meterColor(0.5)).toBe("hsl(60 70% 45%)");
    expect(meterColor(1)).toBe("hsl(120 70% 45%)");
  });
  it("clamps out-of-range input", () => {
    expect(meterColor(2)).toBe(meterColor(1));
    expect(meterColor(-1)).toBe(meterColor(0));
  });
});
