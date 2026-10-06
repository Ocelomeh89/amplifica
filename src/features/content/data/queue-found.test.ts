import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { IngestDb } from "./ingest";
import { queueFound, type QueueDeps, type StoredSource } from "./found";
import type { ContentSourceInsert } from "@/shared/supabase/database.types";

const ARTICLE = `<html><head><title>Their post</title></head><body><article><h1>Their post</h1>${Array.from(
  { length: 6 },
  (_, i) => `<p>Paragraph ${i} ${"words about retirement math ".repeat(8)}</p>`
).join("")}</article></body></html>`;

function setup(over: Partial<QueueDeps> = {}, stored: StoredSource | null = null) {
  const upserts: ContentSourceInsert[] = [];
  const ingestDb: IngestDb = {
    async upsertSources(rows) {
      upserts.push(...rows);
      return rows.map((r, i) => ({ id: `src-${i}`, kind: r.kind, external_id: r.external_id }));
    },
    async insertIdeas() { throw new Error("queue mode must not insert ideas"); },
    async markMined() { throw new Error("queue mode must not mark anything mined"); },
  };
  const setMeta = vi.fn(async (_id: string, _meta: Record<string, unknown>) => {});
  const storeFile = vi.fn(async (_p: string, _b: Uint8Array, _m: string) => {});
  const fetchPage = vi.fn(async (u: string) => ({ html: ARTICLE, finalUrl: u }));
  const deps: QueueDeps = { fetchPage, videoMeta: async () => null, getSource: async () => stored, setMeta, storeFile, ingestDb, ...over };
  return { deps, upserts, setMeta, storeFile, fetchPage };
}

const opts = { note: "saw this", angle: "counterpoint" as const, competitor: "Ramit" };
const url = (u: string) => ({ kind: "url" as const, url: u, ...opts });
const stored = (status: string): StoredSource => ({
  id: "old-1", kind: "url", external_id: "https://example.com/post", title: "Their post",
  url: "https://example.com/post", status, meta: { angle: "open" },
});

describe("queueFound: a new link", () => {
  it("saves an allowed, unmined source with the text, and never calls ingest for ideas", async () => {
    const t = setup();
    const r = await queueFound(t.deps, "owner-1", url("https://example.com/post"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toMatch(/queue/i);
    expect(t.upserts).toHaveLength(1);
    expect(t.upserts[0]).toMatchObject({
      user_id: "owner-1", kind: "url", external_id: "https://example.com/post",
      url: "https://example.com/post", status: "allowed",
    });
    expect(t.upserts[0].mined_at).toBeUndefined();
    const meta = t.upserts[0].meta as { text: string; angle: string; note: string; competitor: string };
    expect(meta).toMatchObject({ angle: "counterpoint", note: "saw this", competitor: "Ramit" });
    expect(meta.text.length).toBeGreaterThan(200);
  });

  it("queues the same article once however it was pasted", async () => {
    const a = setup();
    const b = setup();
    await queueFound(a.deps, "o", url("https://Example.com/post/?utm_source=ig#top"));
    await queueFound(b.deps, "o", url("example.com/post"));
    expect(a.upserts[0].external_id).toBe("https://example.com/post");
    expect(b.upserts[0].external_id).toBe("https://example.com/post");
  });

  it("writes nothing when the fetch fails or the page has too little text", async () => {
    const failing = setup({ fetchPage: async () => { throw new Error("The page answered 404."); } });
    expect(await queueFound(failing.deps, "o", url("https://example.com/gone"))).toEqual({ ok: false, error: "The page answered 404." });
    expect(failing.upserts).toEqual([]);

    const thin = setup({ fetchPage: async (u) => ({ html: "<html><body><p>tiny</p></body></html>", finalUrl: u }) });
    expect((await queueFound(thin.deps, "o", url("https://example.com/x"))).ok).toBe(false);
    expect(thin.upserts).toEqual([]);
  });

  it("rejects a private address before any fetch", async () => {
    const t = setup();
    expect((await queueFound(t.deps, "o", url("http://169.254.169.254/latest"))).ok).toBe(false);
    expect(t.fetchPage).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing when the write fails", async () => {
    const t = setup();
    t.deps.ingestDb.upsertSources = async () => { throw new Error("db down"); };
    await expect(queueFound(t.deps, "o", url("https://example.com/post"))).resolves.toEqual({ ok: false, error: "db down" });
  });
});

describe("queueFound: a text file", () => {
  const bytes = new TextEncoder().encode("Retirement math ".repeat(30));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const up = (filename: string, b: Uint8Array = bytes) => ({ kind: "upload" as const, filename, bytes: b, ...opts });

  it("keys the source by content hash, stores the file, and queues the text", async () => {
    const t = setup();
    const r = await queueFound(t.deps, "owner-1", up("talk.txt"));
    expect(r.ok).toBe(true);
    expect(t.upserts[0]).toMatchObject({ kind: "upload", external_id: hash, title: "talk.txt", status: "allowed" });
    expect((t.upserts[0].meta as { text: string }).text).toContain("Retirement math");
    expect(t.storeFile).toHaveBeenCalledWith(`owner-1/${hash}/talk.txt`, bytes, "text/plain");
  });

  it("refuses a PDF and writes nothing, pointing at /content-found", async () => {
    const t = setup();
    const r = await queueFound(t.deps, "o", up("talk.pdf", new Uint8Array([37, 80, 68, 70])));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/content-found/);
    expect(t.upserts).toEqual([]);
    expect(t.storeFile).not.toHaveBeenCalled();
  });
});

describe("queueFound: sources that already exist", () => {
  it.each([
    ["denied", /denied/i],
    ["mined", /content-found/],
    ["pending", /decision/i],
  ])("refuses a %s source and writes nothing", async (status, message) => {
    const t = setup({}, stored(status));
    const r = await queueFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
    expect(t.upserts).toEqual([]);
    expect(t.setMeta).not.toHaveBeenCalled();
    expect(t.storeFile).not.toHaveBeenCalled();
  });

  it("refreshes an already queued source instead of adding a second row", async () => {
    const t = setup({}, stored("allowed"));
    const r = await queueFound(t.deps, "o", url("https://example.com/post"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toMatch(/already queued/i);
    expect(t.upserts).toEqual([]);
    expect(t.setMeta).toHaveBeenCalledTimes(1);
    expect(t.setMeta.mock.calls[0][0]).toBe("old-1");
    expect(t.setMeta.mock.calls[0][1]).toMatchObject({ angle: "counterpoint", note: "saw this" });
  });

  it("keeps the stored file reference when an upload is refreshed under a new filename", async () => {
    const bytes = new TextEncoder().encode("Retirement math ".repeat(30));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing: StoredSource = {
      id: "old-2", kind: "upload", external_id: hash, title: "talk.txt", url: null, status: "allowed",
      meta: { filename: "talk.txt", storage_path: `owner-1/${hash}/talk.txt` },
    };
    const t = setup({}, existing);
    const r = await queueFound(t.deps, "owner-1", { kind: "upload", filename: "renamed.txt", bytes, ...opts });
    expect(r.ok).toBe(true);
    expect(t.setMeta).toHaveBeenCalledTimes(1);
    expect(t.setMeta.mock.calls[0][1]).toMatchObject({
      filename: "talk.txt", storage_path: `owner-1/${hash}/talk.txt`, angle: "counterpoint",
    });
    expect(t.storeFile).not.toHaveBeenCalled();
  });
});
