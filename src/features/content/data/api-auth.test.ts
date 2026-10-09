import { afterEach, describe, expect, it } from "vitest";
import { authorizeRoutine, isAuthorized } from "./api-auth";

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

describe("authorizeRoutine", () => {
  const original = process.env.CONTENT_OWNER_USER_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.CONTENT_OWNER_USER_ID;
    else process.env.CONTENT_OWNER_USER_ID = original;
  });

  it("401s a bad token before looking at the owner", () => {
    delete process.env.CONTENT_OWNER_USER_ID;
    const out = authorizeRoutine(req("Bearer nope"), "s3cret");
    expect("response" in out && out.response.status).toBe(401);
  });
  it("500s a good token when the owner is not configured", () => {
    delete process.env.CONTENT_OWNER_USER_ID;
    const out = authorizeRoutine(req("Bearer s3cret"), "s3cret");
    expect("response" in out && out.response.status).toBe(500);
  });
  it("returns the owner for a good token", () => {
    process.env.CONTENT_OWNER_USER_ID = "owner-1";
    expect(authorizeRoutine(req("Bearer s3cret"), "s3cret")).toEqual({ owner: "owner-1" });
  });
});
