import { describe, expect, it } from "vitest";
import { canUseInvestments } from "./investments-access";

describe("canUseInvestments", () => {
  it("allows a listed user", () => {
    expect(canUseInvestments("a", "a")).toBe(true);
    expect(canUseInvestments("b", " a , b ")).toBe(true);
  });
  it("blocks everyone else", () => {
    expect(canUseInvestments("c", "a,b")).toBe(false);
    expect(canUseInvestments("a", undefined)).toBe(false);
    expect(canUseInvestments("a", "")).toBe(false);
    expect(canUseInvestments(null, "a")).toBe(false);
    expect(canUseInvestments("", ",")).toBe(false);
  });
});
