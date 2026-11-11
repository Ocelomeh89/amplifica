import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { deleteIdeaDrafts, supabaseDraftsDb } from "./supabase-drafts-db";

function client(error: { message: string } | null) {
  const calls: [string, string][] = [];
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn((col: string, val: string) => {
      calls.push([col, val]);
      return calls.length >= 2 ? Promise.resolve({ error }) : chain;
    }),
  };
  return { c: { from: vi.fn(() => chain) } as unknown as SupabaseClient<Database>, calls, chain };
}

describe("deleteIdeaDrafts", () => {
  it("deletes by idea and user, both scoped", async () => {
    const { c, calls } = client(null);
    await deleteIdeaDrafts(c, "user-1", "idea-1");
    expect(calls).toEqual([["idea_id", "idea-1"], ["user_id", "user-1"]]);
  });
  it("throws with the database message on failure", async () => {
    const { c } = client({ message: "denied" });
    await expect(deleteIdeaDrafts(c, "u", "i")).rejects.toThrow("delete drafts: denied");
  });
});

describe("supabaseDraftsDb and the brand gate", () => {
  function logClient() {
    const log: [string, ...unknown[]][] = [];
    const c = {
      from(table: string) {
        const b: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "i1" }], error: null }).then(ok) };
        for (const m of ["update", "eq", "select"]) b[m] = (...args: unknown[]) => (log.push([`${table}.${m}`, ...args]), b);
        return b;
      },
    } as unknown as SupabaseClient<Database>;
    return { c, log };
  }
  const result = { verdict: "fail" as const, reader: null, pillar: null, amplifica_pillar: null, failed: [{ item: "downside" as const, reason: "No risk." }] };

  it("a first fail records the count and keeps the idea queued", async () => {
    const { c, log } = logClient();
    await supabaseDraftsDb(c, "u1").gateFail("i1", result, 1, false);
    const update = log.find((x) => x[0] === "content_ideas.update")![1] as Record<string, unknown>;
    expect(update).toMatchObject({ gate: { result, draft_fails: 1 } });
    expect(update.status).toBeUndefined();
    expect(log).toContainEqual(["content_ideas.eq", "user_id", "u1"]);
  });

  it("a final fail takes the idea out of the queue to gate_failed", async () => {
    const { c, log } = logClient();
    await supabaseDraftsDb(c, "u1").gateFail("i1", result, 2, true);
    const update = log.find((x) => x[0] === "content_ideas.update")![1] as Record<string, unknown>;
    expect(update).toMatchObject({ status: "gate_failed", queue_rank: null, gate: { draft_fails: 2, prior_status: "queued" } });
    expect(log).toContainEqual(["content_ideas.eq", "status", "queued"]);
  });
});
