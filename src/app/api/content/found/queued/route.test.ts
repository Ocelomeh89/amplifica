// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queuedFound } = vi.hoisted(() => ({
  queuedFound: vi.fn(async () => ({
    rows: [
      { id: "a", kind: "url", external_id: "https://example.com/a", title: "A", url: "https://example.com/a", meta: { text: "x".repeat(60) }, created_at: "2026-10-01T00:00:00Z" },
      { id: "b", kind: "url", external_id: "https://example.com/b", title: "B", url: "https://example.com/b", meta: { text: "y".repeat(60) }, created_at: "2026-10-02T00:00:00Z" },
    ],
    total: 2,
  })),
}));
vi.mock("@/shared/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/features/content/data/supabase-db", () => ({ supabaseFoundQueueDb: () => ({ queuedFound }) }));

import { GET } from "./route";

const req = (path = "", headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/content/found/queued${path}`, { headers });

describe("GET /api/content/found/queued", () => {
  const original = { secret: process.env.CONTENT_ENGINE_SECRET, owner: process.env.CONTENT_OWNER_USER_ID };
  beforeEach(() => {
    process.env.CONTENT_ENGINE_SECRET = "s3cret";
    process.env.CONTENT_OWNER_USER_ID = "owner-1";
    queuedFound.mockClear();
  });
  afterEach(() => {
    for (const [k, v] of [["CONTENT_ENGINE_SECRET", original.secret], ["CONTENT_OWNER_USER_ID", original.owner]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("rejects a missing or wrong bearer, and everyone when the secret is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("", { authorization: "Bearer nope" }))).status).toBe(401);
    delete process.env.CONTENT_ENGINE_SECRET;
    expect((await GET(req("", { authorization: "Bearer s3cret" }))).status).toBe(401);
    expect(queuedFound).not.toHaveBeenCalled();
  });

  it("is a 500, not a leak, when the owner variable is missing", async () => {
    delete process.env.CONTENT_OWNER_USER_ID;
    const res = await GET(req("", { authorization: "Bearer s3cret" }));
    expect(res.status).toBe(500);
    expect(queuedFound).not.toHaveBeenCalled();
  });

  it("returns the queued sources oldest first and honors ?limit=", async () => {
    const res = await GET(req("?limit=1", { authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].external_id).toBe("https://example.com/a");
    expect(body.remaining).toBe(1);
  });

  it("reports a database failure as a 500", async () => {
    queuedFound.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req("", { authorization: "Bearer s3cret" }));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });
});
