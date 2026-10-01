import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { IDEAS_PROMPT } from "@/features/content/engine/prompts/ideas";
import { angleBlock } from "@/features/content/engine/angle";
import type { IngestDb } from "./ingest";
import { mineFound, type FoundDeps, type FoundInput, type StoredSource } from "./found";
import type { ContentIdeaInsert, ContentSourceInsert } from "@/shared/supabase/database.types";

const idea = {
  format: "reel", title: "T", hook: "H", hook_alt: null, belief_attacked: "b", value_to_listener: "v",
  why_it_stops: "w", outline: [{ beat: "x" }], quote: "q", quote_ref: "r", pillar: "method",
  hook_type: "belief-attacking", score: 0.5,
};
const good = { source_excerpt: "EXCERPT", ideas: [idea, { ...idea, title: "T2" }] };

const ARTICLE = `<html><head><title>Their post</title></head><body><article><h1>Their post</h1>${Array.from(
  { length: 6 },
  (_, i) => `<p>Paragraph ${i} ${"words about retirement math ".repeat(8)}</p>`
).join("")}</article></body></html>`;

const NOW = new Date("2026-10-01T17:00:00Z"); // 12:00 in Chicago, same calendar day

function setup(over: Partial<FoundDeps> = {}, stored: StoredSource | null = null, dbOver: Partial<IngestDb> = {}) {
  const sources: ContentSourceInsert[] = [];
  const ideas: ContentIdeaInsert[] = [];
  const mined: { kind: string; external_id: string; mined_at: string }[] = [];
  const ingestDb: IngestDb = {
    async upsertSources(rows) { sources.push(...rows); return rows.map((r, i) => ({ id: `src-${i}`, kind: r.kind, external_id: r.external_id })); },
    async insertIdeas(rows) { ideas.push(...rows); return rows.map((r, i) => ({ id: `idea-${i}`, format: r.format, title: r.title, hook: r.hook })); },
    async markMined(rows) { mined.push(...rows); return rows.length; },
    ...dbOver,
  };
  const generate = vi.fn(async (_i: { system: string; text: string; pdf?: { base64: string } }): Promise<unknown> => good);
  const setMeta = vi.fn(async (_id: string, _meta: Record<string, unknown>) => {});
  const storeFile = vi.fn(async (_p: string, _b: Uint8Array, _m: string) => {});
  const fetchPage = vi.fn(async (url: string) => ({ html: ARTICLE, finalUrl: url }));
  const deps: FoundDeps = {
    now: () => NOW,
    fetchPage,
    videoMeta: async () => ({ title: "A video", description: "d".repeat(60) }),
    getSource: async () => stored,
    setMeta,
    storeFile,
    loadFile: async () => new Uint8Array([1, 2, 3]),
    context: async () => ({ taste_rules: [], recent_feedback: [], queue_depth: {}, known_titles: ["Old idea"] }),
    generator: { generate },
    ingestDb,
    ...over,
  };
  return { deps, sources, ideas, mined, generate, setMeta, storeFile, fetchPage };
}

const opts = { note: "saw this today", angle: "counterpoint" as const, competitor: "Ramit" };
const url = (u: string): FoundInput => ({ kind: "url", url: u, ...opts });

describe("mineFound: a URL", () => {
  it("fetches, generates with the shared prompt and the angle, writes through ingest, and marks mined", async () => {
    const t = setup();
    const r = await mineFound(t.deps, "owner-1", url("https://example.com/post"));
    expect(r).toEqual({ ok: true, count: 2, sourceId: "src-0" });
    const call = t.generate.mock.calls[0][0];
    expect(call.system).toBe(IDEAS_PROMPT);
    expect(call.text).toContain(angleBlock("counterpoint", "Ramit"));
    expect(call.text).toContain("saw this today");
    expect(call.text).toContain("Old idea");
    expect(t.sources[0]).toMatchObject({ kind: "url", external_id: "https://example.com/post", status: "allowed", user_id: "owner-1" });
    expect(t.sources[0].meta).toMatchObject({ angle: "counterpoint", competitor: "Ramit", note: "saw this today" });
    expect(t.ideas).toHaveLength(2);
    expect(t.ideas[0]).toMatchObject({ source_id: "src-0", batch_date: "2026-10-01", status: "inbox", quote_ref: "https://example.com/post" });
    expect(t.mined).toEqual([{ kind: "url", external_id: "https://example.com/post", mined_at: NOW.toISOString() }]);
  });

  it("treats the same article pasted with tracking params, a fragment, or no scheme as one source", async () => {
    const a = setup();
    const b = setup();
    await mineFound(a.deps, "o", url("https://Example.com/post/?utm_source=ig#top"));
    await mineFound(b.deps, "o", url("example.com/post"));
    expect(a.sources[0].external_id).toBe("https://example.com/post");
    expect(b.sources[0].external_id).toBe("https://example.com/post");
  });

  it("rejects a private address before any fetch", async () => {
    const t = setup();
    const r = await mineFound(t.deps, "o", url("http://169.254.169.254/latest"));
    expect(r.ok).toBe(false);
    expect(t.fetchPage).not.toHaveBeenCalled();
  });

  it("rejects a page with too little readable text and writes nothing", async () => {
    const t = setup({ fetchPage: async (u) => ({ html: "<html><body><p>tiny</p></body></html>", finalUrl: u }) });
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(false);
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.sources).toEqual([]);
  });

  it("returns the fetch error instead of throwing, and writes nothing", async () => {
    const t = setup({ fetchPage: async () => { throw new Error("The page answered 404."); } });
    const r = await mineFound(t.deps, "o", url("https://example.com/gone"));
    expect(r).toEqual({ ok: false, error: "The page answered 404." });
    expect(t.sources).toEqual([]);
  });
});

describe("mineFound: model output problems write nothing", () => {
  it.each([
    ["zero ideas", { ideas: [] }],
    ["eleven ideas", { ideas: Array(11).fill(idea) }],
    ["a malformed idea", { ideas: [{ ...idea, hook: "" }] }],
    ["not an object", "oops"],
  ])("%s", async (_name, bad) => {
    const t = setup({ generator: { generate: async () => bad } });
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(false);
    expect(t.sources).toEqual([]);
    expect(t.ideas).toEqual([]);
    expect(t.mined).toEqual([]);
  });
  it("surfaces a generator failure", async () => {
    const t = setup({ generator: { generate: async () => { throw new Error("overloaded"); } } });
    expect(await mineFound(t.deps, "o", url("https://example.com/post"))).toEqual({ ok: false, error: "overloaded" });
    expect(t.sources).toEqual([]);
  });
});

describe("mineFound: sources that already exist", () => {
  const existing = (status: string): StoredSource => ({
    id: "old-1", kind: "url", external_id: "https://example.com/post", title: "Their post", url: "https://example.com/post", status, meta: { angle: "open" },
  });
  it("refuses a denied source", async () => {
    const t = setup({}, existing("denied"));
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(false);
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("generates again for a mined source without re-marking it, and updates its angle and note", async () => {
    const t = setup({}, existing("mined"));
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(true);
    expect(t.mined).toEqual([]);
    expect(t.setMeta).toHaveBeenCalledTimes(1);
    expect(t.setMeta.mock.calls[0][0]).toBe("old-1");
    expect(t.setMeta.mock.calls[0][1]).toMatchObject({ angle: "counterpoint", note: "saw this today" });
  });
});

describe("mineFound: YouTube", () => {
  const yt = url("https://www.youtube.com/watch?v=abc123&si=zz");
  it("uses the Data API title and description and accepts a short description", async () => {
    const t = setup({ videoMeta: async (id) => (id === "abc123" ? { title: "Why I'd never do X", description: "A short description of about fifty characters." } : null) });
    const r = await mineFound(t.deps, "o", yt);
    expect(r.ok).toBe(true);
    expect(t.fetchPage).not.toHaveBeenCalled();
    expect(t.generate.mock.calls[0][0].text).toContain("Why I'd never do X");
    expect(t.sources[0].external_id).toBe("https://www.youtube.com/watch?v=abc123");
  });
  it("explains when the video can't be read", async () => {
    const t = setup({ videoMeta: async () => null });
    const r = await mineFound(t.deps, "o", yt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/YouTube/);
  });
});

describe("mineFound: an upload", () => {
  const bytes = new TextEncoder().encode("Retirement math ".repeat(30));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const up = (filename: string, b: Uint8Array = bytes): FoundInput => ({ kind: "upload", filename, bytes: b, note: "", angle: "open", competitor: "" });

  it("keys a text file by content hash, so the same bytes dedupe", async () => {
    const a = setup();
    const b = setup();
    await mineFound(a.deps, "o", up("a.txt"));
    await mineFound(b.deps, "o", up("renamed.md"));
    expect(a.sources[0].external_id).toBe(hash);
    expect(b.sources[0].external_id).toBe(hash);
    expect(a.sources[0]).toMatchObject({ kind: "upload", title: "a.txt" });
    expect((a.sources[0].meta as { text: string }).text).toContain("Retirement math");
  });
  it("sends a PDF to Claude as a document, stores it, and keeps the excerpt Claude reports", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]); // %PDF-1
    const t = setup();
    const r = await mineFound(t.deps, "owner-1", up("Talk (final).pdf", pdf));
    expect(r.ok).toBe(true);
    expect(t.generate.mock.calls[0][0].pdf).toEqual({ base64: Buffer.from(pdf).toString("base64") });
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    expect(t.storeFile).toHaveBeenCalledWith(`owner-1/${pdfHash}/Talk_final_.pdf`, pdf, "application/pdf");
    expect(t.sources[0].meta).toMatchObject({ text: "EXCERPT", mime: "application/pdf", storage_path: `owner-1/${pdfHash}/Talk_final_.pdf` });
  });
  it("rejects empty, oversize, unsupported, and too-short files before calling Claude", async () => {
    const t = setup();
    for (const bad of [up("a.txt", new Uint8Array()), up("a.txt", new Uint8Array(4 * 1024 * 1024 + 1)), up("a.docx"), up("a.txt", new TextEncoder().encode("tiny"))]) {
      expect((await mineFound(t.deps, "o", bad)).ok).toBe(false);
    }
    expect(t.generate).not.toHaveBeenCalled();
  });
  it("does not store the file when generation fails", async () => {
    const t = setup({ generator: { generate: async () => ({ ideas: [] }) } });
    await mineFound(t.deps, "o", up("a.pdf", new Uint8Array([1, 2])));
    expect(t.storeFile).not.toHaveBeenCalled();
  });
});

describe("mineFound: generate again", () => {
  const again = (): FoundInput => ({ kind: "again", sourceId: "old-1", note: "new angle", angle: "twist", competitor: "" });
  it("re-mines a URL source from its stored text without fetching", async () => {
    const stored: StoredSource = { id: "old-1", kind: "url", external_id: "https://example.com/post", title: "Their post", url: "https://example.com/post", status: "mined", meta: { text: "stored article ".repeat(30), angle: "open" } };
    const t = setup({}, stored);
    const r = await mineFound(t.deps, "o", again());
    expect(r.ok).toBe(true);
    expect(t.fetchPage).not.toHaveBeenCalled();
    expect(t.generate.mock.calls[0][0].text).toContain("stored article");
    expect(t.generate.mock.calls[0][0].text).toContain("TWIST");
    expect(t.setMeta.mock.calls[0][1]).toMatchObject({ angle: "twist", note: "new angle", text: expect.stringContaining("stored article") });
  });
  it("re-mines a PDF source by loading it from storage", async () => {
    const stored: StoredSource = { id: "old-1", kind: "upload", external_id: "h", title: "t.pdf", url: null, status: "mined", meta: { mime: "application/pdf", storage_path: "o/h/t.pdf", text: "EXCERPT" } };
    const loadFile = vi.fn(async () => new Uint8Array([9, 9]));
    const t = setup({ loadFile }, stored);
    expect((await mineFound(t.deps, "o", again())).ok).toBe(true);
    expect(loadFile).toHaveBeenCalledWith("o/h/t.pdf");
    expect(t.generate.mock.calls[0][0].pdf?.base64).toBe(Buffer.from([9, 9]).toString("base64"));
  });
  it("refuses a source that isn't found content", async () => {
    const t = setup({}, { id: "old-1", kind: "plaud", external_id: "x", title: "", url: null, status: "allowed", meta: {} });
    expect((await mineFound(t.deps, "o", again())).ok).toBe(false);
    expect((await mineFound(setup({ getSource: async () => null }).deps, "o", again())).ok).toBe(false);
  });
});

describe("mineFound: failures around the write", () => {
  const existing = (status: string): StoredSource => ({
    id: "old-1", kind: "url", external_id: "https://example.com/post", title: "Their post", url: "https://example.com/post", status, meta: {},
  });
  const boom = async (): Promise<never> => { throw new Error("db down"); };

  it("leaves the source unmined when the idea insert fails", async () => {
    const t = setup({}, null, { insertIdeas: boom });
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(false);
    expect(t.mined).toEqual([]);
    expect(t.setMeta).not.toHaveBeenCalled();
  });
  it("still succeeds when setMeta fails after the ideas were written", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const t = setup({ setMeta: boom }, existing("mined"));
      const r = await mineFound(t.deps, "o", url("https://example.com/post"));
      expect(r).toMatchObject({ ok: true, count: 2 });
      expect(t.ideas).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });
  it("still succeeds when markMined fails for a new source", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const t = setup({}, null, { markMined: boom });
      const r = await mineFound(t.deps, "o", url("https://example.com/post"));
      expect(r).toMatchObject({ ok: true, count: 2 });
    } finally {
      spy.mockRestore();
    }
  });
  it("generates for a pending source without marking it mined", async () => {
    const t = setup({}, existing("pending"));
    const r = await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(true);
    expect(t.mined).toEqual([]);
  });
  it("writes nothing for a denied source", async () => {
    const t = setup({}, existing("denied"));
    await mineFound(t.deps, "o", url("https://example.com/post"));
    expect(t.sources).toEqual([]);
    expect(t.ideas).toEqual([]);
    expect(t.mined).toEqual([]);
    expect(t.storeFile).not.toHaveBeenCalled();
  });
});
