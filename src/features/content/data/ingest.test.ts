import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestSchema } from "@/features/content/engine/schema";
import { ingestPayload, type IngestDb } from "./ingest";
import type { ContentIdeaInsert, ContentSourceInsert } from "@/shared/supabase/database.types";

const example = ingestSchema.parse(JSON.parse(readFileSync("routines/examples/daily-ingest.json", "utf8")));

function fakeDb() {
  const sources: ContentSourceInsert[] = [];
  const ideas: ContentIdeaInsert[] = [];
  const mined: { kind: string; external_id: string; mined_at: string }[] = [];
  const db: IngestDb = {
    async upsertSources(rows) {
      sources.push(...rows);
      return rows.map((r, i) => ({ id: `src-${i}`, kind: r.kind, external_id: r.external_id }));
    },
    async insertIdeas(rows) {
      ideas.push(...rows);
      return rows.map((r, i) => ({ id: `idea-${i}`, format: r.format, title: r.title, hook: r.hook }));
    },
    async markMined(rows) {
      mined.push(...rows);
      return rows.length;
    },
  };
  return { db, sources, ideas, mined };
}

describe("ingestPayload", () => {
  it("writes sources first and stamps the owner on every row", async () => {
    const { db, sources, ideas } = fakeDb();
    const result = await ingestPayload(db, example, "owner-1");
    expect(result.sources).toEqual([
      { id: "src-0", kind: "granola", external_id: "830179d0-d2b4-40d4-9d3f-bfd2adf32f50" },
      { id: "src-1", kind: "granola", external_id: "7110b1e1-c279-465c-b04b-55a19e5287a1" },
    ]);
    expect(result.ideas.map((i) => i.id)).toEqual(["idea-0", "idea-1"]);
    expect(result.ideas[0]).toMatchObject({ format: "reel", title: "A W-2 is a runway, not a cage" });
    expect(sources.every((s) => s.user_id === "owner-1")).toBe(true);
    expect(ideas.every((i) => i.user_id === "owner-1")).toBe(true);
  });

  it("resolves each idea's source_ref to the upserted source id", async () => {
    const { db, ideas } = fakeDb();
    await ingestPayload(db, example, "owner-1");
    expect(ideas[0].source_id).toBe("src-0");
    expect(ideas[1].source_id).toBe("src-0");
  });

  it("maps a shared chain_key to one chain_id per batch", async () => {
    const { db, ideas } = fakeDb();
    let n = 0;
    await ingestPayload(db, example, "owner-1", () => `chain-${++n}`);
    expect(ideas[0].chain_id).toBe("chain-1");
    expect(ideas[1].chain_id).toBe("chain-1");
  });

  it("leaves chain_id null when no chain_key is given", async () => {
    const { db, ideas } = fakeDb();
    const noChain = structuredClone(example);
    delete noChain.ideas[0].chain_key;
    delete noChain.ideas[1].chain_key;
    await ingestPayload(db, noChain, "owner-1");
    expect(ideas[0].chain_id).toBeNull();
  });

  it("stores ideas as inbox with the routine's batch_date and score", async () => {
    const { db, ideas } = fakeDb();
    await ingestPayload(db, example, "owner-1");
    expect(ideas[0].status).toBe("inbox");
    expect(ideas[0].batch_date).toBe("2026-09-17");
    expect(ideas[0].score).toBe(0.82);
  });

  it("stores a hook-backlog newsletter idea with a null source", async () => {
    const { db, ideas } = fakeDb();
    const backlog = structuredClone(example);
    backlog.ideas[0].source_ref = null;
    backlog.ideas[0].format = "newsletter";
    backlog.ideas[0].from_hook_backlog = true;
    await ingestPayload(db, backlog, "owner-1");
    expect(ideas[0].source_id).toBeNull();
  });

  it("marks only the sources that carry mined_at", async () => {
    const { db, mined } = fakeDb();
    const withMined = structuredClone(example);
    withMined.sources[0].mined_at = "2026-09-17T12:00:00Z";
    await ingestPayload(db, withMined, "owner-1");
    expect(mined).toEqual([
      { kind: "granola", external_id: "830179d0-d2b4-40d4-9d3f-bfd2adf32f50", mined_at: "2026-09-17T12:00:00Z" },
    ]);
  });

  it("does not call markMined when no source carries mined_at", async () => {
    const { db, mined } = fakeDb();
    await ingestPayload(db, example, "owner-1");
    expect(mined).toEqual([]);
  });
});
