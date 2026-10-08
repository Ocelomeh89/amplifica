import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const deleteIdeaDrafts = vi.fn();
let statusError: { message: string } | null = null;

// Minimal builder: records the table + operation, resolves per table.
function fakeClient() {
  return {
    from(table: string) {
      let op = "select";
      const done = () => {
        order.push(`${table}.${op}`);
        return { data: null, error: op === "update" && table === "content_ideas" ? statusError : null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        update: () => ((op = "update"), b),
        upsert: () => ((op = "upsert"), Promise.resolve(done())),
        single: () => Promise.resolve({ data: { id: "i1", format: "reel", hook: "h", pillar: "p", hook_type: "t" }, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(done()).then(res),
      };
      return b;
    },
  };
}

vi.mock("@/features/content/data/owner", () => ({
  requireContentOwner: async () => ({ supabase: fakeClient(), user: { id: "u1" } }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/content/data/supabase-drafts-db", () => ({
  deleteIdeaDrafts: (...args: unknown[]) => {
    order.push("deleteIdeaDrafts");
    return deleteIdeaDrafts(...args);
  },
}));

import { markPosted } from "./actions";

const form = (url: string) => {
  const f = new FormData();
  f.set("id", "i1");
  f.set("url", url);
  return f;
};
const GOOD = "https://www.instagram.com/reel/ABC123xyz/";

beforeEach(() => {
  order.length = 0;
  statusError = null;
  deleteIdeaDrafts.mockReset();
  deleteIdeaDrafts.mockResolvedValue(undefined);
});

describe("markPosted", () => {
  it("records the post, then flips the idea, then deletes its drafts", async () => {
    const r = await markPosted(form(GOOD));
    expect(r).toEqual({ error: null });
    expect(order).toEqual(["content_posts.upsert", "content_ideas.update", "deleteIdeaDrafts"]);
    expect(deleteIdeaDrafts).toHaveBeenCalledWith(expect.anything(), "u1", "i1");
  });
  it("swallows a draft-deletion failure", async () => {
    deleteIdeaDrafts.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await markPosted(form(GOOD))).toEqual({ error: null });
    spy.mockRestore();
  });
  it("does not delete drafts for an invalid URL", async () => {
    const r = await markPosted(form("https://example.com/nope"));
    expect(r.error).toMatch(/post URL/);
    expect(deleteIdeaDrafts).not.toHaveBeenCalled();
  });
  it("does not delete drafts when the status update fails", async () => {
    statusError = { message: "denied" };
    expect(await markPosted(form(GOOD))).toEqual({ error: "denied" });
    expect(deleteIdeaDrafts).not.toHaveBeenCalled();
  });
});
