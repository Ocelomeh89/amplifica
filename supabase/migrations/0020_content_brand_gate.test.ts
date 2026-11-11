import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IDEA_STATUSES } from "@/features/content/engine/types";
import { PILLAR_SLUGS } from "@/features/content/engine/brand";

describe("0020_content_brand_gate.sql", () => {
  const sql = readFileSync("supabase/migrations/0020_content_brand_gate.sql", "utf8");
  const listAfter = (marker: string) => {
    const at = sql.indexOf(marker);
    const m = sql.slice(at).match(/in \(([^)]*)\)/i);
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };

  it("idea statuses equal the engine constant, including the two gate statuses", () => {
    expect(IDEA_STATUSES).toContain("gating");
    expect(IDEA_STATUSES).toContain("gate_failed");
    expect(listAfter("add constraint content_ideas_status_check")).toEqual([...IDEA_STATUSES].sort());
  });

  it("adds the gate columns and the gating index", () => {
    expect(sql).toMatch(/add column gate jsonb/);
    expect(sql).toMatch(/add column gate_original jsonb/);
    expect(sql).toMatch(/add column gate_attempts integer not null default 0/);
    expect(sql).toMatch(/add column ingest_batch uuid/);
    expect(sql).toMatch(/add column digest_posted_at timestamptz/);
    expect(sql).toMatch(/create index \w+ on public\.content_ideas\s*\(user_id, created_at\)\s*where status = 'gating'/);
  });

  it("post message allows the pillars and keeps the old canon values for history", () => {
    const list = listAfter("add constraint content_posts_message_check") ?? [];
    for (const p of PILLAR_SLUGS) expect(list).toContain(p);
    for (const old of ["", "none", "velocity", "scoreboard", "forced-sale"]) expect(list).toContain(old);
  });
});
