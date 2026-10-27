import { describe, expect, it } from "vitest";
import { MissingApiKeyError, type ToolCaller } from "./claude";
import {
  pickOption,
  regenerate,
  runRecreation,
  startRecreation,
  type RecreateContext,
  type RecreateDb,
  type RecreationRow,
} from "./recreate";
import { recreatedIdeaSchema, type RecreateMode, type RecreateOption } from "@/features/content/engine/recreate";

const NOW = new Date("2026-10-26T15:00:00Z"); // 10:00 in Chicago, day starts 05:00Z
const POST = "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10";
const opt = (topic: string, message = "velocity"): RecreateOption => ({ hook: `Hook ${topic}`, angle: `Angle ${topic}`, topic, message });
const OPTIONS = [opt("a"), opt("b"), opt("c")];

const CTX: RecreateContext = {
  post: { id: POST, hook_type: "question", pillar: "method", tagged_at: "2026-10-20T00:00:00Z" },
  source: {
    hook_type: "question", onscreen_text: "repeats-hook", message: "velocity", cta_type: "none", post_style: "talking-head-text",
    cover_face: true, cover_text: true, cover_number: false, hook_spoken: "Spoken hook", hook_onscreen: "", tag_confidence: {},
    tag_locks: [], tagged_at: "2026-10-20T00:00:00Z", caption: "Caption", media_type: "reel", figures: ["Views: 1"],
  },
  insights: { state: "thin", have: 3, need: 15 },
  winnerHooks: [],
  recentHooks: [],
};

function fakeDb(opts: { ctx?: RecreateContext | null; tagged?: boolean; insertFails?: boolean } = {}) {
  const rows: RecreationRow[] = [];
  const ideas: unknown[] = [];
  let seq = 0;
  const db: RecreateDb & { rows: RecreationRow[]; ideas: unknown[] } = {
    rows,
    ideas,
    async expireStale(postId, before) {
      for (const r of rows) if (r.source_post_id === postId && r.status === "pending" && r.created_at < before) {
        r.status = "failed";
        r.error = "Timed out";
      }
    },
    async countSince(since) {
      return rows.filter((r) => r.created_at >= since).length;
    },
    async live(postId, mode) {
      return rows.find((r) => r.source_post_id === postId && r.mode === mode && (r.status === "pending" || r.status === "ready")) ?? null;
    },
    async insertPending(postId, mode) {
      if (await db.live(postId, mode)) return null;
      const id = `r${++seq}`;
      rows.push({ id, source_post_id: postId, mode, status: "pending", options: [], error: "", idea_id: null, created_at: NOW.toISOString() });
      return id;
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async finish(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "pending") return;
      r.status = patch.status;
      if (patch.status === "ready") r.options = patch.options;
      else r.error = patch.error;
    },
    async claim(id, index) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "ready") return null;
      r.status = "picked";
      (r as RecreationRow & { picked_index?: number }).picked_index = index;
      return { ...r };
    },
    async unclaim(id) {
      const r = rows.find((x) => x.id === id);
      if (r && r.status === "picked") r.status = "ready";
    },
    async linkIdea(id, ideaId) {
      const r = rows.find((x) => x.id === id);
      if (r) r.idea_id = ideaId;
    },
    async insertIdea(idea) {
      await Promise.resolve();
      if (opts.insertFails) throw new Error("db down");
      ideas.push(idea);
      return `idea${ideas.length}`;
    },
    async discard(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || (r.status !== "ready" && r.status !== "failed")) return false;
      r.status = "discarded";
      return true;
    },
    async sourceBasics(postId) {
      if (opts.tagged === false) return { id: postId, hook_type: "question", pillar: "", tagged_at: null };
      return postId === POST ? { id: POST, hook_type: "question", pillar: "method", tagged_at: "2026-10-20T00:00:00Z" } : null;
    },
    async sourceContext() {
      return opts.ctx === undefined ? CTX : opts.ctx;
    },
  };
  return db;
}

const caller = (raw: unknown): ToolCaller => ({ call: async () => raw });
const readyRow = async (db: ReturnType<typeof fakeDb>, mode: RecreateMode = "same-recipe") => {
  const s = await startRecreation(db, POST, mode, NOW);
  if (!s.ok) throw new Error("start failed");
  // Adjacent options must leave the source message (velocity), or the row would end failed instead of ready.
  const options = mode === "adjacent" ? [opt("a", "scoreboard"), opt("b", "forced-sale"), opt("c", "credit-ladder")] : OPTIONS;
  await runRecreation(db, caller({ options }), s.id, NOW);
  return s.id;
};

describe("startRecreation", () => {
  it("expires stale pending rows first, then inserts", async () => {
    const db = fakeDb();
    db.rows.push({ id: "old", source_post_id: POST, mode: "same-recipe", status: "pending", options: [], error: "", idea_id: null, created_at: "2026-10-26T14:40:00Z" });
    const r = await startRecreation(db, POST, "same-recipe", NOW);
    expect(r.ok).toBe(true);
    expect(db.rows.find((x) => x.id === "old")).toMatchObject({ status: "failed", error: "Timed out" });
    expect(db.rows.filter((x) => x.status === "pending")).toHaveLength(1);
  });

  it("refuses when a live row exists and returns its id", async () => {
    const db = fakeDb();
    const first = await startRecreation(db, POST, "same-recipe", NOW);
    const second = await startRecreation(db, POST, "same-recipe", NOW);
    expect(second).toMatchObject({ ok: false, liveId: first.ok ? first.id : "" });
  });

  it("allows the other mode while one is live", async () => {
    const db = fakeDb();
    await startRecreation(db, POST, "same-recipe", NOW);
    expect((await startRecreation(db, POST, "adjacent", NOW)).ok).toBe(true);
  });

  it("refuses at the daily cap, counting by Chicago date", async () => {
    const db = fakeDb();
    for (let i = 0; i < 10; i++) {
      db.rows.push({ id: `t${i}`, source_post_id: "other", mode: "adjacent", status: "failed", options: [], error: "", idea_id: null, created_at: "2026-10-26T05:30:00Z" });
    }
    expect(await startRecreation(db, POST, "same-recipe", NOW)).toEqual({ ok: false, error: "That's 10 recreations today. Try again tomorrow." });
  });

  it("does not count rows from the previous Chicago day", async () => {
    const db = fakeDb();
    for (let i = 0; i < 10; i++) {
      db.rows.push({ id: `t${i}`, source_post_id: "other", mode: "adjacent", status: "failed", options: [], error: "", idea_id: null, created_at: "2026-10-26T04:59:00Z" });
    }
    expect((await startRecreation(db, POST, "same-recipe", NOW)).ok).toBe(true);
  });

  it("refuses an untagged post and a missing post", async () => {
    expect(await startRecreation(fakeDb({ tagged: false }), POST, "same-recipe", NOW)).toMatchObject({ ok: false });
    expect(await startRecreation(fakeDb(), "other-post", "same-recipe", NOW)).toMatchObject({ ok: false });
  });
});

describe("runRecreation", () => {
  it("writes ready with 3 valid options", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    expect(db.rows.find((r) => r.id === id)).toMatchObject({ status: "ready", options: OPTIONS });
  });

  it("writes failed when Claude returns invalid options, naming the problem", async () => {
    const db = fakeDb();
    const s = await startRecreation(db, POST, "same-recipe", NOW);
    if (!s.ok) throw new Error("x");
    await runRecreation(db, caller({ options: [opt("a"), opt("a"), opt("c")] }), s.id, NOW);
    const row = db.rows.find((r) => r.id === s.id)!;
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/different topics/i);
  });

  it("writes failed when the source post is gone", async () => {
    const db = fakeDb({ ctx: null });
    const s = await startRecreation(db, POST, "same-recipe", NOW);
    if (!s.ok) throw new Error("x");
    await runRecreation(db, caller({ options: OPTIONS }), s.id, NOW);
    expect(db.rows.find((r) => r.id === s.id)).toMatchObject({ status: "failed", error: "The source post is gone." });
  });

  it("writes failed with the key message when the API key is missing", async () => {
    const db = fakeDb();
    const s = await startRecreation(db, POST, "same-recipe", NOW);
    if (!s.ok) throw new Error("x");
    await runRecreation(db, { call: async () => { throw new MissingApiKeyError(); } }, s.id, NOW);
    expect(db.rows.find((r) => r.id === s.id)!.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("never throws, even when the caller rejects", async () => {
    const db = fakeDb();
    const s = await startRecreation(db, POST, "same-recipe", NOW);
    if (!s.ok) throw new Error("x");
    await expect(runRecreation(db, { call: async () => { throw new Error("boom"); } }, s.id, NOW)).resolves.toBeUndefined();
    expect(db.rows.find((r) => r.id === s.id)).toMatchObject({ status: "failed", error: "boom" });
  });
});

describe("pickOption", () => {
  it("claims, inserts a reel idea at score 1 and links it", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    const r = await pickOption(db, id, 1, NOW);
    expect(r).toEqual({ ideaId: "idea1" });
    const idea = recreatedIdeaSchema.parse(db.ideas[0]);
    expect(idea).toMatchObject({ format: "reel", score: 1, hook: "Hook b", source_post_id: POST, batch_date: "2026-10-26", pillar: "method" });
    expect(db.rows.find((x) => x.id === id)).toMatchObject({ status: "picked", idea_id: "idea1" });
  });

  it("returns an error and inserts nothing when the row is no longer ready", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    await db.discard(id);
    expect(await pickOption(db, id, 0, NOW)).toEqual({ error: "These options are no longer available." });
    expect(db.ideas).toHaveLength(0);
  });

  it("rejects an index outside 0 to 2 without claiming", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    expect(await pickOption(db, id, 3, NOW)).toMatchObject({ error: expect.any(String) });
    expect(db.rows.find((x) => x.id === id)!.status).toBe("ready");
  });

  it("a double pick makes one idea", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    const [a, b] = await Promise.all([pickOption(db, id, 0, NOW), pickOption(db, id, 0, NOW)]);
    expect([a, b].filter((x) => "ideaId" in x)).toHaveLength(1);
    expect(db.ideas).toHaveLength(1);
  });

  it("goes back to ready when the idea insert fails", async () => {
    const db = fakeDb({ insertFails: true });
    const id = await readyRow(db);
    expect(await pickOption(db, id, 0, NOW)).toMatchObject({ error: expect.any(String) });
    expect(db.rows.find((x) => x.id === id)!.status).toBe("ready");
  });
});

describe("regenerate", () => {
  it("discards the card, starts a new one for the same post and mode, and counts toward the cap", async () => {
    const db = fakeDb();
    const id = await readyRow(db, "adjacent");
    const r = await regenerate(db, id, NOW);
    expect(r.ok).toBe(true);
    expect(db.rows.find((x) => x.id === id)!.status).toBe("discarded");
    expect(db.rows.filter((x) => x.status === "pending" && x.mode === "adjacent")).toHaveLength(1);
    expect(await db.countSince("2026-10-26T05:00:00Z")).toBe(2);
  });

  it("retrying a stale pending card starts a new run", async () => {
    const db = fakeDb();
    db.rows.push({ id: "stale", source_post_id: POST, mode: "same-recipe", status: "pending", options: [], error: "", idea_id: null, created_at: "2026-10-26T14:40:00Z" });
    const r = await regenerate(db, "stale", NOW);
    expect(r.ok).toBe(true);
    expect(db.rows.find((x) => x.id === "stale")!.status).toBe("discarded");
    expect(db.rows.filter((x) => x.status === "pending")).toHaveLength(1);
  });

  it("keeps the card when the daily cap would refuse the new run", async () => {
    const db = fakeDb();
    const id = await readyRow(db, "adjacent");
    for (let i = 0; i < 9; i++) {
      db.rows.push({ id: `t${i}`, source_post_id: "other", mode: "adjacent", status: "failed", options: [], error: "", idea_id: null, created_at: "2026-10-26T05:30:00Z" });
    }
    expect(await regenerate(db, id, NOW)).toMatchObject({ ok: false });
    expect(db.rows.find((x) => x.id === id)!.status).toBe("ready");
  });

  it("keeps the card when the post was untagged since", async () => {
    const db = fakeDb();
    const id = await readyRow(db);
    const untagged = fakeDb({ tagged: false });
    untagged.rows.push({ ...db.rows[0] });
    expect(await regenerate(untagged, id, NOW)).toMatchObject({ ok: false });
    expect(untagged.rows.find((x) => x.id === id)!.status).toBe("ready");
  });

  it("refuses a card that cannot be replaced", async () => {
    const db = fakeDb();
    const s = await startRecreation(db, POST, "same-recipe", NOW);
    if (!s.ok) throw new Error("x");
    expect(await regenerate(db, s.id, NOW)).toMatchObject({ ok: false }); // still pending
  });
});
