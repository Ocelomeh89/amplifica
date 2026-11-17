import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseDraftsDb } from "./supabase-drafts-db";

type Call = [string, ...unknown[]];

// Recording fake: every builder method logs itself and returns the builder; awaiting resolves canned data.
function fakeClient(draftIds: string[], ideaRows: Record<string, unknown>[], count: number) {
  const log: Record<string, Call[]> = { content_drafts: [], content_ideas: [] };
  const client = {
    from(table: string) {
      const calls = log[table];
      const result =
        table === "content_drafts"
          ? { data: draftIds.map((idea_id) => ({ idea_id })), error: null }
          : { data: ideaRows, error: null, count };
      const b: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
      };
      b.maybeSingle = () => Promise.resolve({ data: ideaRows[0] ?? null, error: null });
      for (const m of ["select", "eq", "not", "or", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return b;
        };
      }
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log };
}

const NOW = new Date("2026-10-07T12:00:00.000Z");
const row = (id: string) => ({ id, format: "reel", title: "t", status: "queued" });

describe("supabaseDraftsDb.queuedWithoutDraft", () => {
  it("excludes drafted ids server-side with .not(id, in, (a,b))", async () => {
    const { client, log } = fakeClient(["a", "b"], [row("c")], 1);
    await supabaseDraftsDb(client, "u1").queuedWithoutDraft(5, NOW);
    expect(log.content_ideas).toContainEqual(["not", "id", "in", "(a,b)"]);
  });
  it("does not call .not when there are no drafts", async () => {
    const { client, log } = fakeClient([], [row("c")], 1);
    await supabaseDraftsDb(client, "u1").queuedWithoutDraft(5, NOW);
    expect(log.content_ideas.some((c) => c[0] === "not")).toBe(false);
  });
  it("limits to the requested limit and scopes both queries by user_id", async () => {
    const { client, log } = fakeClient(["a"], [row("c")], 1);
    await supabaseDraftsDb(client, "u1").queuedWithoutDraft(3, NOW);
    expect(log.content_ideas).toContainEqual(["limit", 3]);
    expect(log.content_ideas).toContainEqual(["eq", "user_id", "u1"]);
    expect(log.content_drafts).toContainEqual(["eq", "user_id", "u1"]);
  });
  it("takes total from the count, not the rows length", async () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(`i${n}`));
    const { client } = fakeClient([], rows, 12);
    const r = await supabaseDraftsDb(client, "u1").queuedWithoutDraft(5, NOW);
    expect(r.ideas).toHaveLength(5);
    expect(r.total).toBe(12);
  });
  it("51 drafted ids ahead do not hide an undrafted idea", async () => {
    const drafted = Array.from({ length: 51 }, (_, i) => `d${i}`);
    const { client } = fakeClient(drafted, [row("open")], 1);
    const r = await supabaseDraftsDb(client, "u1").queuedWithoutDraft(5, NOW);
    expect(r.ideas.map((i) => i.id)).toEqual(["open"]);
    expect(r.ideas[0].has_draft).toBe(false);
    expect(r.total).toBe(1);
  });
  it("excludes never-used ideas: 31-day cutoff on feedback_at, falling back to created_at", async () => {
    const { client, log } = fakeClient([], [row("c")], 1);
    await supabaseDraftsDb(client, "u1").queuedWithoutDraft(5, NOW);
    const cutoff = new Date(NOW.getTime() - 31 * 86_400_000).toISOString();
    expect(cutoff).toBe("2026-09-06T12:00:00.000Z");
    expect(log.content_ideas).toContainEqual([
      "or",
      `feedback_at.gt.${cutoff},and(feedback_at.is.null,created_at.gt.${cutoff})`,
    ]);
  });
});

describe("supabaseDraftsDb.ideaById", () => {
  it("is not filtered by age, so an explicit stale id still works", async () => {
    const { client, log } = fakeClient([], [], 0);
    await supabaseDraftsDb(client, "u1").ideaById("x");
    expect(log.content_ideas.some((c) => c[0] === "or")).toBe(false);
  });
});
