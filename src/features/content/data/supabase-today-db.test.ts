import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseTodayDb } from "./supabase-today-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, { data?: unknown; error?: { code?: string; message: string } | null; count?: number }> = {}) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? {};
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: res.data ?? [], error: res.error ?? null, count: res.count ?? 0 }).then(ok),
      };
      for (const m of ["select", "eq", "in", "lt", "gte", "order", "limit", "update", "insert", "range"]) {
        b[m] = (...args: unknown[]) => {
          log.push([`${table}.${m}`, ...args]);
          return b;
        };
      }
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log };
}

describe("supabaseTodayDb", () => {
  it("filters every read by the owner", async () => {
    const { client, log } = fakeClient();
    const db = supabaseTodayDb(client, "u1");
    await db.liveTests();
    await db.liveSlots("2026-10-27");
    await db.openBefore("2026-10-27");
    await db.runFor("2026-10-27", "cron");
    await db.countRunsSince("2026-10-27T05:00:00Z");
    const tables = ["content_experiments.eq", "content_today_runs.eq"];
    for (const t of tables) expect(log.filter((c) => c[0] === t && c[1] === "user_id").length).toBeGreaterThan(0);
    const selects = log.filter((c) => c[0].endsWith(".select")).length;
    const owners = log.filter((c) => c[1] === "user_id" && c[2] === "u1").length;
    expect(owners).toBe(selects);
  });

  it("insertRun returns null on the cron unique conflict", async () => {
    const { client } = fakeClient({ content_today_runs: { error: { code: "23505", message: "duplicate" } } });
    expect(await supabaseTodayDb(client, "u1").insertRun({ day: "2026-10-27", kind: "cron" })).toBeNull();
  });

  it("countRunsSince counts only swap and moment runs", async () => {
    const { client, log } = fakeClient({ content_today_runs: { count: 3 } });
    expect(await supabaseTodayDb(client, "u1").countRunsSince("2026-10-27T05:00:00Z")).toBe(3);
    expect(log).toContainEqual(["content_today_runs.in", "kind", ["swap", "moment"]]);
  });

  it("patchIdea touches only an Inbox or queued idea and returns null when none matched", async () => {
    const { client, log } = fakeClient({ content_ideas: { data: [] } });
    const out = await supabaseTodayDb(client, "u1").patchIdea("i1", { hook: "h", hook_alt: "o", hook_type: "", title: "t", outline: [], status: "queued", score: 1 });
    expect(out).toBeNull();
    expect(log).toContainEqual(["content_ideas.in", "status", ["inbox", "queued"]]);
    expect(log).toContainEqual(["content_ideas.eq", "user_id", "u1"]);
  });

  it("returnToInbox only moves a queued idea", async () => {
    const { client, log } = fakeClient();
    await supabaseTodayDb(client, "u1").returnToInbox("i1");
    expect(log).toContainEqual(["content_ideas.update", { status: "inbox", queue_rank: null }]);
    expect(log).toContainEqual(["content_ideas.eq", "status", "queued"]);
  });
});
