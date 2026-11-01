import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { loadSharpenStates } from "./queries";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, unknown[]>) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "order", "limit"]) {
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

const NOW = new Date("2026-11-01T15:00:00Z");

describe("loadSharpenStates", () => {
  it("does nothing for no ideas", async () => {
    const { client, log } = fakeClient({});
    expect(await loadSharpenStates(client, "u1", [], NOW)).toEqual({ sharpens: {}, blocked: {} });
    expect(log).toEqual([]);
  });

  it("returns each idea's live card and why an idea cannot be sharpened, for the owner", async () => {
    const { client, log } = fakeClient({
      content_sharpens: [{ id: "s1", idea_id: "a", note_id: null, status: "ready", options: [], error: "", chips: [], text: "", created_at: "2026-11-01T14:50:00Z" }],
      content_drafts: [{ idea_id: "b" }],
      content_experiments: [{ idea_id: "c" }],
    });
    const out = await loadSharpenStates(client, "u1", [{ id: "a", obsidian_path: null }, { id: "b", obsidian_path: null }, { id: "c", obsidian_path: null }, { id: "d", obsidian_path: "C - Writing/x.md" }], NOW);
    expect(out.sharpens.a.status).toBe("ready");
    expect(out.blocked).toEqual({ b: "Already drafted.", c: "This idea is in today's brief.", d: "Already drafted." });
    for (const t of ["content_sharpens", "content_drafts", "content_experiments"]) expect(log).toContainEqual([`${t}.eq`, "user_id", "u1"]);
    expect(log).toContainEqual(["content_experiments.in", "status", ["open", "posted"]]);
  });
});
