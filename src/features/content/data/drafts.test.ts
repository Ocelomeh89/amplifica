import { describe, expect, it, vi } from "vitest";
import { DraftStoreError, getDraftQueue, postDraft, QUEUE_LIMIT, type DraftIdea, type DraftsDb } from "./drafts";

const ID = "7b1f6c52-0a6e-4f43-9d1e-2f6b8f7d3a10";
const NOW = new Date("2026-10-07T12:00:00Z");

const idea = (over: Partial<DraftIdea> = {}): DraftIdea => ({
  id: ID, format: "reel", title: "t", hook: "I took a W-2.", hook_alt: null, belief_attacked: "", value_to_listener: "",
  why_it_stops: "", outline: [], quote: "q", quote_ref: "r", pillar: "p", hook_type: "h", status: "queued", has_draft: false, ...over,
});

function fakeDb(over: Partial<DraftsDb> = {}): DraftsDb & { stored: unknown[] } {
  const stored: unknown[] = [];
  return {
    stored,
    queuedWithoutDraft: async (limit, _now) => ({ ideas: [idea()].slice(0, limit), total: 1 }),
    ideaById: async () => idea(),
    voice: async () => ({ profile_md: "profile", exemplars: [], built_from: { files: [] }, built_at: "2026-10-01T00:00:00Z" }),
    storeDraft: async (args) => { stored.push(args); },
    ...over,
  };
}

const body = {
  idea_id: ID, raw: "raw", humanized: "## Hook\nI took a W-2.\n\n## Script\nShort script.",
  obsidian_path: "C - Writing/Content/reel/2026-10-07 i-took-a-w-2.md",
};

describe("getDraftQueue", () => {
  it("returns undrafted ideas with voice, prompts, and the vault folder", async () => {
    const r = await getDraftQueue(fakeDb(), null, NOW);
    expect(r.status).toBe(200);
    const b = r.body as Record<string, unknown>;
    expect((b.ideas as unknown[]).length).toBe(1);
    expect(b.remaining).toBe(0);
    expect(b.vault_folder).toBe("C - Writing/Content");
    expect(b.voice_stale).toBe(false);
    expect(Object.keys(b.prompts as object).sort()).toEqual(["draft", "humanize"]);
    expect((b.voice as { profile_md: string }).profile_md).toBe("profile");
  });
  it("sends voice.files from built_from, [] when legacy or null", async () => {
    const files = [{ path: "C - Writing/a.md", mtime: "2026-10-07T01:00:00Z", bytes: 10 }];
    const withFiles = await getDraftQueue(fakeDb({ voice: async () => ({ profile_md: "p", exemplars: [], built_from: { files }, built_at: "2026-10-01T00:00:00Z" }) }), null, NOW);
    expect((withFiles.body as { voice: { files: unknown[] } }).voice.files).toEqual(files);
    const legacy = await getDraftQueue(fakeDb({ voice: async () => ({ profile_md: "p", exemplars: [], built_from: null, built_at: "2026-10-01T00:00:00Z" }) }), null, NOW);
    expect((legacy.body as { voice: { files: unknown[] } }).voice.files).toEqual([]);
  });
  it("suggests an obsidian path per idea using the America/Chicago date", async () => {
    // 2026-10-08T02:00Z is still 2026-10-07 in Chicago (CDT).
    const late = new Date("2026-10-08T02:00:00Z");
    const r = await getDraftQueue(fakeDb(), null, late);
    expect((r.body as { ideas: { suggested_obsidian_path: string }[] }).ideas[0].suggested_obsidian_path).toBe(
      "C - Writing/Content/reel/2026-10-07 i-took-a-w-2.md"
    );
  });
  it("falls back to the idea slug for a symbol-only hook, also in the by-id path", async () => {
    const r = await getDraftQueue(fakeDb({ ideaById: async () => idea({ hook: "🔥💸" }) }), ID, NOW);
    expect((r.body as { ideas: { suggested_obsidian_path: string }[] }).ideas[0].suggested_obsidian_path).toBe(
      "C - Writing/Content/reel/2026-10-07 idea.md"
    );
  });
  it("asks the db for at most QUEUE_LIMIT and reports what remains", async () => {
    const queuedWithoutDraft = vi.fn(async () => ({ ideas: [idea(), idea({ id: "b" })], total: 9 }));
    const r = await getDraftQueue(fakeDb({ queuedWithoutDraft }), null, NOW);
    expect(queuedWithoutDraft).toHaveBeenCalledWith(QUEUE_LIMIT, NOW);
    expect((r.body as { remaining: number }).remaining).toBe(7);
  });
  it("flags a missing or old voice as stale and still serves ideas", async () => {
    const none = await getDraftQueue(fakeDb({ voice: async () => null }), null, NOW);
    expect((none.body as { voice: unknown; voice_stale: boolean }).voice).toBeNull();
    expect((none.body as { voice_stale: boolean }).voice_stale).toBe(true);
    const old = await getDraftQueue(fakeDb({ voice: async () => ({ profile_md: "p", exemplars: [], built_from: {}, built_at: "2026-08-01T00:00:00Z" }) }), null, NOW);
    expect((old.body as { voice_stale: boolean }).voice_stale).toBe(true);
  });
  it("returns one idea by id even when it already has a draft", async () => {
    const r = await getDraftQueue(fakeDb({ ideaById: async () => idea({ has_draft: true }) }), ID, NOW);
    expect(r.status).toBe(200);
    expect((r.body as { ideas: DraftIdea[] }).ideas[0].has_draft).toBe(true);
  });
  it("400 on a malformed id, 404 on a missing one, 409 when the idea is not queued", async () => {
    expect((await getDraftQueue(fakeDb(), "nope", NOW)).status).toBe(400);
    expect((await getDraftQueue(fakeDb({ ideaById: async () => null }), ID, NOW)).status).toBe(404);
    expect((await getDraftQueue(fakeDb({ ideaById: async () => idea({ status: "posted" }) }), ID, NOW)).status).toBe(409);
  });
});

describe("postDraft", () => {
  it("lints the humanized text, stores once, and returns the hits", async () => {
    const db = fakeDb();
    const r = await postDraft(db, { ...body, humanized: "## Script\nA guaranteed win." });
    expect(r.status).toBe(200);
    expect((r.body as { lint: { rule: string }[] }).lint.map((h) => h.rule)).toContain("guarantee");
    expect(db.stored).toHaveLength(1);
    expect(db.stored[0]).toMatchObject({ idea_id: ID, obsidian_path: body.obsidian_path, redo: false });
  });
  it("writes nothing on an invalid body", async () => {
    const db = fakeDb();
    const r = await postDraft(db, { ...body, humanized: "" });
    expect(r.status).toBe(400);
    expect(db.stored).toHaveLength(0);
  });
  it("404 for an unknown idea; 409 idea_not_queued when it was posted meanwhile", async () => {
    expect((await postDraft(fakeDb({ ideaById: async () => null }), body)).status).toBe(404);
    const r = await postDraft(fakeDb({ ideaById: async () => idea({ status: "posted" }) }), body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "idea_not_queued" });
  });
  it("409 draft_exists unless redo is set", async () => {
    const db = fakeDb({ ideaById: async () => idea({ has_draft: true }) });
    expect((await postDraft(db, body)).body).toEqual({ error: "draft_exists" });
    expect((await postDraft(db, { ...body, redo: true })).status).toBe(200);
  });
  it("400 when the path folder disagrees with the idea's format", async () => {
    const db = fakeDb();
    const r = await postDraft(db, { ...body, obsidian_path: "C - Writing/Content/newsletter/2026-10-07 x.md" });
    expect(r.status).toBe(400);
    expect(db.stored).toHaveLength(0);
  });
  it("maps a store-time race (DraftStoreError) to 409", async () => {
    const db = fakeDb({ storeDraft: async () => { throw new DraftStoreError("draft_exists"); } });
    const r = await postDraft(db, body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "draft_exists" });
  });
  it("lets an unexpected store failure propagate", async () => {
    const db = fakeDb({ storeDraft: async () => { throw new Error("boom"); } });
    await expect(postDraft(db, body)).rejects.toThrow("boom");
  });
});
