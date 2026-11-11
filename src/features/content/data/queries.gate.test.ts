import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { loadGateFailed, loadPillarBalance } from "./queries";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, unknown[]>) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "gte", "order", "limit"]) {
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

describe("loadGateFailed", () => {
  it("returns the owner's gate_failed ideas with their source title and reasons", async () => {
    const { client, log } = fakeClient({
      content_ideas: [{ id: "i1", title: "T", format: "reel", source_id: "s1", gate: { result: { failed: [{ item: "reader", reason: "Nobody." }] } } }],
      content_sources: [{ id: "s1", title: "Plaud: walk" }],
    });
    expect(await loadGateFailed(client, "u1")).toEqual([{ id: "i1", title: "T", format: "reel", source: "Plaud: walk", failed: [{ item: "reader", reason: "Nobody." }] }]);
    expect(log).toContainEqual(["content_ideas.eq", "status", "gate_failed"]);
    expect(log.filter((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1")).toHaveLength(2);
  });
});

describe("loadPillarBalance", () => {
  it("counts this week's passed ideas and posted pieces per pillar", async () => {
    const { client } = fakeClient({
      content_ideas: [{ pillar: "w2-advantage", gate: { checked_at: "2026-11-10T14:00:00Z", result: { verdict: "pass" } } }],
      content_posts: [{ message: "w2-advantage", posted_at: "2026-11-10T13:00:00Z" }, { message: "velocity", posted_at: "2026-11-10T13:00:00Z" }],
    });
    const b = await loadPillarBalance(client, "u1", new Date("2026-11-10T15:00:00Z"));
    expect(b["w2-advantage"]).toBe(2);
    expect(b["life-by-design"]).toBe(0);
  });
});
