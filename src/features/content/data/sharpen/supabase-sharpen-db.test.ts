import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseSharpenDb } from "./supabase-sharpen-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
type Res = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

function fakeClient(tables: Record<string, Res> = {}) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      log.push([`${table}.from`]);
      const res = tables[table] ?? {};
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: res.data ?? [], error: res.error ?? null, count: res.count ?? 0 }).then(ok),
      };
      for (const m of ["select", "eq", "in", "is", "lt", "gte", "order", "limit", "update", "insert"]) {
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

const ideaRow = { id: "i1", title: "T", hook: "H", belief_attacked: "B", value_to_listener: "V", why_it_stops: "W", outline: [{ beat: "a" }, { beat: "b" }], pillar: "method", format: "reel", status: "inbox", obsidian_path: null };

describe("supabaseSharpenDb", () => {
  it("filters every read and write by the owner", async () => {
    const { client, log } = fakeClient({ content_ideas: { data: [ideaRow] }, content_sharpens: { data: [{ id: "s1" }] } });
    const db = supabaseSharpenDb(client, "u1");
    await db.idea("i1");
    await db.expireStale("i1", "2026-11-01T00:00:00Z");
    await db.countSince("2026-11-01T00:00:00Z");
    await db.live("i1");
    await db.get("s1");
    await db.finish("s1", { status: "failed", error: "x" });
    await db.claim("s1", 0);
    await db.unclaim("s1");
    await db.discard("s1");
    await db.patchIdea("i1", { title: "t", hook: "h", hook_alt: "o", hook_type: "paradox", belief_attacked: "b", value_to_listener: "v", why_it_stops: "w", outline: [{ beat: "a" }] });
    await db.activeRules();
    // Every chain that reads or updates carries the owner filter (an insert carries it in its payload).
    const chains: Call[][] = [];
    for (const c of log) (c[0].endsWith(".from") ? chains.push([c]) : chains[chains.length - 1]?.push(c));
    const unfiltered = chains.filter((ch) => ch.some((c) => /\.(select|update)$/.test(c[0])) && !ch.some((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1"));
    expect(unfiltered.map((ch) => ch[0][0])).toEqual([]);
  });

  it("idea() maps the outline to beats and flags a draft, an Obsidian file and a live brief", async () => {
    const plain = await supabaseSharpenDb(fakeClient({ content_ideas: { data: [ideaRow] } }).client, "u1").idea("i1");
    expect(plain).toMatchObject({ id: "i1", outline: ["a", "b"], drafted: false, heldByBrief: false });
    const drafted = await supabaseSharpenDb(fakeClient({ content_ideas: { data: [ideaRow] }, content_drafts: { data: [{ idea_id: "i1" }] } }).client, "u1").idea("i1");
    expect(drafted?.drafted).toBe(true);
    const filed = await supabaseSharpenDb(fakeClient({ content_ideas: { data: [{ ...ideaRow, obsidian_path: "C - Writing/x.md" }] } }).client, "u1").idea("i1");
    expect(filed?.drafted).toBe(true);
    const { client, log } = fakeClient({ content_ideas: { data: [ideaRow] }, content_experiments: { data: [{ id: "e1" }] } });
    expect((await supabaseSharpenDb(client, "u1").idea("i1"))?.heldByBrief).toBe(true);
    expect(log).toContainEqual(["content_experiments.in", "status", ["open", "posted"]]);
  });

  it("insertPending returns null on the live unique conflict", async () => {
    const { client } = fakeClient({ content_sharpens: { error: { code: "23505", message: "duplicate" } } });
    expect(await supabaseSharpenDb(client, "u1").insertPending("i1", "n1", [], "")).toBeNull();
  });

  it("patchIdea touches only an inbox or queued idea and reports whether a row matched", async () => {
    const { client, log } = fakeClient({ content_ideas: { data: [] } });
    expect(await supabaseSharpenDb(client, "u1").patchIdea("i1", { title: "t", hook: "h", hook_alt: "o", hook_type: "paradox", belief_attacked: "b", value_to_listener: "v", why_it_stops: "w", outline: [] })).toBe(false);
    expect(log).toContainEqual(["content_ideas.in", "status", ["inbox", "queued"]]);
  });

  it("claim only takes a ready row; discard only a pending, ready or failed one", async () => {
    const { client, log } = fakeClient({ content_sharpens: { data: [] } });
    const db = supabaseSharpenDb(client, "u1");
    expect(await db.claim("s1", 1)).toBeNull();
    expect(await db.discard("s1")).toBe(false);
    expect(log).toContainEqual(["content_sharpens.eq", "status", "ready"]);
    expect(log).toContainEqual(["content_sharpens.in", "status", ["pending", "ready", "failed"]]);
  });

  it("activeRules reads only active rules", async () => {
    const { client, log } = fakeClient({ content_taste_rules: { data: [{ rule: "A" }, { rule: "B" }] } });
    expect(await supabaseSharpenDb(client, "u1").activeRules()).toEqual(["A", "B"]);
    expect(log).toContainEqual(["content_taste_rules.eq", "status", "active"]);
  });

  it("liveForIdeas returns pending and ready rows by idea, a stale pending one as failed", async () => {
    const now = new Date("2026-11-01T15:00:00Z");
    const row = (id: string, idea: string, status: string, created: string) => ({ id, idea_id: idea, note_id: null, status, options: [], error: "", chips: [], text: "", created_at: created });
    const { client } = fakeClient({
      content_sharpens: { data: [row("s1", "i1", "ready", "2026-11-01T14:00:00Z"), row("s2", "i2", "pending", "2026-11-01T14:00:00Z"), row("s3", "i3", "pending", "2026-11-01T14:55:00Z")] },
    });
    const m = await supabaseSharpenDb(client, "u1").liveForIdeas(["i1", "i2", "i3"], now);
    expect(m.get("i1")?.status).toBe("ready");
    expect(m.get("i2")).toMatchObject({ status: "failed", error: "Timed out" });
    expect(m.get("i3")?.status).toBe("pending");
  });
});
