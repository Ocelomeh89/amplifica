import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each(["/dashboard", "/reset-password", "/projections/abc?tab=2#top"])(
    "keeps the in-app path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    }
  );

  it.each([
    null,
    "",
    "dashboard",
    "https://evil.com",
    "//evil.com",
    "//evil.com/dashboard",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
  ])("rejects %j", (raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});
