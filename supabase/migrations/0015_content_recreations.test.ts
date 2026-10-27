import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RECREATE_MODES, RECREATE_STATUSES } from "@/features/content/engine/recreate";

describe("0015_content_recreations.sql", () => {
  const sql = readFileSync("supabase/migrations/0015_content_recreations.sql", "utf8");
  const listFor = (col: string) => {
    const m = sql.match(new RegExp(`check \\(${col} in \\(([^)]*)\\)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };

  it("mode check list equals RECREATE_MODES", () => {
    expect(listFor("mode")).toEqual([...RECREATE_MODES].sort());
  });

  it("status check list equals RECREATE_STATUSES", () => {
    expect(listFor("status")).toEqual([...RECREATE_STATUSES].sort());
  });

  it("has a partial unique index on source_post_id and mode for pending and ready", () => {
    expect(sql).toMatch(
      /create unique index \w+ on public\.content_recreations\s*\(source_post_id, mode\)\s*where status in \('pending', 'ready'\)/i
    );
  });

  it("cascades from the source post and nulls the idea link", () => {
    expect(sql).toMatch(/source_post_id uuid not null references public\.content_posts\(id\) on delete cascade/i);
    expect(sql).toMatch(/idea_id uuid references public\.content_ideas\(id\) on delete set null/i);
  });

  it("adds source_post_id to content_ideas with on delete set null", () => {
    expect(sql).toMatch(
      /alter table public\.content_ideas\s+add column source_post_id uuid references public\.content_posts\(id\) on delete set null/i
    );
  });

  it("enables RLS with the four owner policies and the touch trigger", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).toMatch(/touch_updated_at/);
  });
});
