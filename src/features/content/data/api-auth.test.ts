import { describe, expect, it } from "vitest";
import { isAuthorized } from "./api-auth";

const req = (auth?: string) =>
  new Request("http://x/api/content/ingest", { headers: auth ? { authorization: auth } : {} });

describe("isAuthorized", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong token, a missing header, and a non-bearer scheme", () => {
    expect(isAuthorized(req("Bearer nope"), "s3cret")).toBe(false);
    expect(isAuthorized(req(), "s3cret")).toBe(false);
    expect(isAuthorized(req("Basic s3cret"), "s3cret")).toBe(false);
  });
  it("rejects everything when the secret is unset or empty", () => {
    expect(isAuthorized(req("Bearer "), "")).toBe(false);
    expect(isAuthorized(req("Bearer x"), undefined)).toBe(false);
  });
});
