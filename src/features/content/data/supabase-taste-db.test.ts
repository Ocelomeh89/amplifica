import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseTasteDb } from "./supabase-taste-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
type Res = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

function fakeClient(tables: Record<string, Res> = {}, rpc: Res = {}) {
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
    rpc(name: string, args: unknown) {
      log.push([`rpc.${name}`, args]);
      return Promise.resolve({ data: null, error: rpc.error ?? null });
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log };
}

describe("supabaseTasteDb", () => {
  it("filters every read and write by the owner", async () => {
    const { client, log } = fakeClient({ content_taste_notes: { data: [{ id: "n1" }] }, content_taste_rules: { data: [{ id: "r1" }] }, content_taste_proposals: { data: [{ id: "p1" }] } });
    const db = supabaseTasteDb(client, "u1");
    await db.unusedNotes();
    await db.rules();
    await db.proposalsSince("2026-11-01T06:00:00Z");
    await db.livePending("2026-11-01T14:50:00Z");
    await db.finishProposal("p1", { status: "ready" });
    await db.setRule("r1", { status: "active" });
    // Every chain that reads or updates carries the owner filter (an insert carries it in its payload).
    const chains: Call[][] = [];
    for (const c of log) (c[0].endsWith(".from") ? chains.push([c]) : chains[chains.length - 1]?.push(c));
    const unfiltered = chains.filter((ch) => ch.some((c) => /\.(select|update)$/.test(c[0])) && !ch.some((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1"));
    expect(unfiltered.map((ch) => ch[0][0])).toEqual([]);
  });

  it("setRule keeps the active flag in step with the status", async () => {
    const { client, log } = fakeClient({ content_taste_rules: { data: [{ id: "r1" }] } });
    const db = supabaseTasteDb(client, "u1");
    await db.setRule("r1", { status: "active", rule: "New" });
    await db.setRule("r1", { status: "off" });
    expect(log).toContainEqual(["content_taste_rules.update", { status: "active", active: true, rule: "New" }]);
    expect(log).toContainEqual(["content_taste_rules.update", { status: "off", active: false }]);
  });

  it("insertManualRule makes an active manual rule", async () => {
    const { client, log } = fakeClient({ content_taste_rules: { data: [{ id: "r9" }] } });
    expect(await supabaseTasteDb(client, "u1").insertManualRule("Take a side.")).toBe("r9");
    expect(log).toContainEqual(["content_taste_rules.insert", { user_id: "u1", rule: "Take a side.", origin: "manual", status: "active", active: true, evidence_count: 0 }]);
  });

  it("applyProposal calls the function with the six named arguments", async () => {
    const { client, log } = fakeClient();
    await supabaseTasteDb(client, "u1").applyProposal("p1", { inserts: [{ rule: "A", note_ids: ["n1"] }], evidence: [{ rule_id: "r1", note_ids: ["n2"] }] }, ["n1", "n2"], "2026-11-01T15:00:00Z");
    expect(log).toContainEqual([
      "rpc.content_apply_taste_proposal",
      { p_user: "u1", p_proposal: "p1", p_inserts: [{ rule: "A", note_ids: ["n1"] }], p_evidence: [{ rule_id: "r1", note_ids: ["n2"] }], p_notes: ["n1", "n2"], p_at: "2026-11-01T15:00:00Z" },
    ]);
  });

  it("applyProposal throws when the function fails, so the proposal is marked failed", async () => {
    const { client } = fakeClient({}, { error: { message: "boom" } });
    await expect(supabaseTasteDb(client, "u1").applyProposal("p1", { inserts: [], evidence: [] }, [], "2026-11-01T15:00:00Z")).rejects.toThrow(/boom/);
  });

  it("page groups rules by status, joins each rule's cited notes and counts the waiting notes and proposals left", async () => {
    const note = (id: string, proposal: string | null) => ({ id, idea_id: "i1", chips: ["Hook too weak"], text: "", source: "sharpen", proposal_id: proposal, created_at: "2026-11-01T14:00:00Z" });
    const rule = (id: string, status: string, note_ids: string[]) => ({ id, rule: id, status, origin: "derived", evidence_count: note_ids.length, last_evidence_at: null, note_ids, created_at: "2026-11-01T13:00:00Z" });
    const { client } = fakeClient({
      content_taste_notes: { data: [note("n1", "p0"), note("n2", null)] },
      content_taste_rules: { data: [rule("rp", "proposed", ["n1"]), rule("ra", "active", ["n2"]), rule("ro", "off", []), rule("rr", "rejected", [])] },
      content_ideas: { data: [{ id: "i1", title: "T", hook: "H" }] },
      content_taste_proposals: { data: [{ id: "p1" }], count: 1 },
    });
    const page = await supabaseTasteDb(client, "u1").page(new Date("2026-11-01T15:00:00Z"));
    expect(page.proposed.map((r) => [r.id, r.notes.map((n) => n.id)])).toEqual([["rp", ["n1"]]]);
    expect(page.active.map((r) => [r.id, r.notes.map((n) => n.id)])).toEqual([["ra", ["n2"]]]);
    expect(page.off.map((r) => r.id)).toEqual(["ro"]);
    expect(page.waiting).toBe(1);
    expect(page.proposalsLeft).toBe(2);
    expect(page.notes[0].idea).toEqual({ title: "T", hook: "H" });
  });

  it("insertProposal returns null on the one-pending unique conflict, and stale pending ones are failed first", async () => {
    const { client, log } = fakeClient({ content_taste_proposals: { error: { code: "23505", message: "duplicate" } } });
    const db = supabaseTasteDb(client, "u1");
    expect(await db.insertProposal("auto")).toBeNull();
    await db.expireStaleProposals("2026-11-01T14:50:00Z").catch(() => undefined);
    expect(log).toContainEqual(["content_taste_proposals.update", { status: "failed", error: "Timed out" }]);
    expect(log).toContainEqual(["content_taste_proposals.lt", "created_at", "2026-11-01T14:50:00Z"]);
  });
});
