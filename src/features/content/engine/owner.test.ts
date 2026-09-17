import { describe, expect, it } from "vitest";
import { isContentOwner } from "./owner";

describe("isContentOwner", () => {
  it("is true only when both ids are set and equal", () => {
    expect(isContentOwner("u1", "u1")).toBe(true);
    expect(isContentOwner("u1", "u2")).toBe(false);
  });

  it("is false when the env var is unset, so an empty env never opens the page", () => {
    expect(isContentOwner("u1", undefined)).toBe(false);
    expect(isContentOwner("u1", "")).toBe(false);
  });

  it("is false for an anonymous caller", () => {
    expect(isContentOwner(null, "u1")).toBe(false);
    expect(isContentOwner(undefined, "u1")).toBe(false);
  });
});
