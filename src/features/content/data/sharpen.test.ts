import { describe, expect, it } from "vitest";
import type { ToolCaller } from "./claude";
import { cancelSharpen, pickSharpen, retrySharpen, runSharpen, sharpenBlock, startSharpen } from "./sharpen";
import { NOW, fakeSharpenDb, option, sharpIdea } from "./sharpen.fake";
import { SHARPEN_DAILY_CAP } from "@/features/content/engine/taste";

const caller = (out: unknown): ToolCaller & { calls: { system: string; text: string }[] } => {
  const calls: { system: string; text: string }[] = [];
  return { calls, call: async (input) => (calls.push(input as never), out) };
};
const good = { options: [option(1), option(2), option(3)] };
const start = (f: ReturnType<typeof fakeSharpenDb>, chips = ["Hook too weak"], text = "") => startSharpen(f.db, "i1", { chips, text }, NOW);

describe("startSharpen", () => {
  it("stores a note and a pending row", async () => {
    const f = fakeSharpenDb();
    const r = await start(f, ["Hook too weak"], "too generic");
    expect(r).toMatchObject({ ok: true });
    expect(f.notes).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({ idea_id: "i1", status: "pending", chips: ["Hook too weak"], text: "too generic" });
  });

  it("refuses an empty request", async () => {
    const f = fakeSharpenDb();
    expect(await start(f, [], "   ")).toEqual({ ok: false, error: "Say what's off first." });
    expect(f.notes).toHaveLength(0);
  });

  it("refuses a missing, passed, drafted or briefed idea with the exact copy", async () => {
    expect(await startSharpen(fakeSharpenDb().db, "nope", { chips: ["Too vague"], text: "" }, NOW)).toEqual({ ok: false, error: "That idea was not found." });
    const cases: [Partial<ReturnType<typeof sharpIdea>>, string][] = [
      [{ status: "rejected" }, "Only Inbox and queued ideas can be sharpened."],
      [{ drafted: true }, "Already drafted."],
      [{ heldByBrief: true }, "This idea is in today's brief."],
    ];
    for (const [over, error] of cases) {
      const f = fakeSharpenDb({ ideas: [sharpIdea("i1", over)] });
      expect(await start(f)).toEqual({ ok: false, error });
      expect(f.notes).toHaveLength(0);
    }
  });

  it("drops unknown chips and cuts the text at 500 characters", async () => {
    const f = fakeSharpenDb();
    await start(f, ["Too vague", "Made up chip"], "x".repeat(600));
    expect(f.rows[0].chips).toEqual(["Too vague"]);
    expect(f.rows[0].text).toHaveLength(500);
  });

  it("refuses a second live sharpen and the eleventh of the day", async () => {
    const f = fakeSharpenDb();
    await start(f);
    expect(await start(f)).toEqual({ ok: false, error: "This idea is already being sharpened." });
    const g = fakeSharpenDb();
    for (let k = 0; k < SHARPEN_DAILY_CAP; k++) g.rows.push({ id: `old${k}`, idea_id: "other", note_id: null, status: "picked", options: [], error: "", chips: [], text: "", created_at: NOW.toISOString() });
    expect(await start(g)).toEqual({ ok: false, error: "That's 10 sharpens today. Try again tomorrow." });
  });

  it("a pending row older than 10 minutes no longer blocks a new sharpen", async () => {
    const f = fakeSharpenDb();
    await start(f);
    f.rows[0].created_at = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    expect(await start(f)).toMatchObject({ ok: true });
    expect(f.rows[0]).toMatchObject({ status: "failed", error: "Timed out" });
  });
});

describe("runSharpen", () => {
  it("writes three options, with the approved rules in the prompt", async () => {
    const f = fakeSharpenDb({ rules: ["Name one number."] });
    const s = await start(f, ["No numbers"]);
    if (!s.ok) throw new Error(s.error);
    const c = caller(good);
    await runSharpen(f.db, c, s.id);
    expect(f.rows[0]).toMatchObject({ status: "ready" });
    expect(f.rows[0].options).toHaveLength(3);
    expect(c.calls[0].system).toContain("- Name one number.");
    expect(c.calls[0].text).toContain("What is off: No numbers");
  });

  it("fails the row on a bad answer and never throws", async () => {
    const f = fakeSharpenDb();
    const s = await start(f);
    if (!s.ok) throw new Error(s.error);
    await runSharpen(f.db, caller({ options: [option(1)] }), s.id);
    expect(f.rows[0].status).toBe("failed");
    const g = fakeSharpenDb();
    const t = await start(g);
    if (!t.ok) throw new Error(t.error);
    await expect(runSharpen(g.db, { call: async () => { throw new Error("boom"); } }, t.id)).resolves.toBeUndefined();
    expect(g.rows[0]).toMatchObject({ status: "failed", error: "boom" });
  });
});

async function ready(f: ReturnType<typeof fakeSharpenDb>) {
  const s = await start(f);
  if (!s.ok) throw new Error(s.error);
  await runSharpen(f.db, caller(good), s.id);
  return s.id;
}

describe("pickSharpen", () => {
  it("rewrites the idea in place, moves the old hook to hook_alt, and reports whether it was queued", async () => {
    const f = fakeSharpenDb({ ideas: [sharpIdea("i1", { status: "queued" })] });
    const id = await ready(f);
    expect(await pickSharpen(f.db, id, 1)).toEqual({ ideaId: "i1", queued: true });
    expect(f.ideas.get("i1")!.hook).toBe("Hook 2");
    expect(f.calls.patches[0]).toMatchObject({ hook_alt: "Should you max your 401k?" });
    expect(f.rows[0].status).toBe("picked");
  });

  it("rejects an index outside the three", async () => {
    const f = fakeSharpenDb();
    const id = await ready(f);
    expect(await pickSharpen(f.db, id, 3)).toEqual({ error: "Pick one of the 3 rewrites." });
  });

  it("discards the sharpen and leaves the idea alone when it was drafted since", async () => {
    const f = fakeSharpenDb();
    const id = await ready(f);
    f.ideas.get("i1")!.drafted = true;
    expect(await pickSharpen(f.db, id, 0)).toEqual({ error: "Already drafted." });
    expect(f.rows[0].status).toBe("discarded");
    expect(f.calls.patched).toHaveLength(0);
  });

  it("discards when the idea went to a brief or was passed since", async () => {
    for (const over of [{ heldByBrief: true }, { status: "rejected" }]) {
      const f = fakeSharpenDb();
      const id = await ready(f);
      Object.assign(f.ideas.get("i1")!, over);
      const r = await pickSharpen(f.db, id, 0);
      expect(r).toHaveProperty("error");
      expect(f.rows[0].status).toBe("discarded");
      expect(f.calls.patched).toHaveLength(0);
    }
  });

  it("a double pick writes the idea once", async () => {
    const f = fakeSharpenDb();
    const id = await ready(f);
    const [a, b] = await Promise.all([pickSharpen(f.db, id, 0), pickSharpen(f.db, id, 1)]);
    expect(f.calls.patched).toEqual(["i1"]);
    expect([a, b].filter((r) => "error" in r)).toEqual([{ error: "These rewrites are no longer available." }]);
  });

  it("puts the card back when the write fails", async () => {
    const f = fakeSharpenDb({ patchFails: true });
    const id = await ready(f);
    expect(await pickSharpen(f.db, id, 0)).toEqual({ error: "Couldn't save the idea. Try again." });
    expect(f.rows[0].status).toBe("ready");
  });
});

describe("retrySharpen and cancelSharpen", () => {
  it("retry discards the card and starts a new one with the same chips and text and no new note", async () => {
    const f = fakeSharpenDb();
    const s = await start(f, ["Too vague"], "more concrete");
    if (!s.ok) throw new Error(s.error);
    await runSharpen(f.db, caller(good), s.id);
    const r = await retrySharpen(f.db, s.id, NOW);
    expect(r).toMatchObject({ ok: true, noteId: s.noteId });
    expect(f.notes).toHaveLength(1);
    expect(f.rows.map((x) => x.status)).toEqual(["discarded", "pending"]);
    expect(f.rows[1]).toMatchObject({ chips: ["Too vague"], text: "more concrete", note_id: s.noteId });
  });

  it("a refused retry keeps the card Miguel has", async () => {
    const f = fakeSharpenDb();
    const id = await ready(f);
    f.ideas.get("i1")!.drafted = true;
    expect(await retrySharpen(f.db, id, NOW)).toEqual({ ok: false, error: "Already drafted." });
    expect(f.rows[0].status).toBe("ready");
  });

  it("cancel discards a card", async () => {
    const f = fakeSharpenDb();
    const id = await ready(f);
    expect(await cancelSharpen(f.db, id)).toEqual({ error: null });
    expect(f.rows[0].status).toBe("discarded");
    expect(await cancelSharpen(f.db, id)).toEqual({ error: "That card can't be cancelled right now." });
  });
});

describe("sharpenBlock", () => {
  it("is null for an open idea and names why for the others", () => {
    expect(sharpenBlock(sharpIdea())).toBeNull();
    expect(sharpenBlock(null)).toBe("That idea was not found.");
    expect(sharpenBlock(sharpIdea("i1", { status: "queued" }))).toBeNull();
  });
});
