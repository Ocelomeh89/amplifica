import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The migration is applied by hand in the Supabase dashboard, so nothing runs
// it in CI. What can be asserted is that every table it creates is named in
// the block that enables RLS and attaches the updated_at trigger.
const TABLES = [
  "content_sources",
  "content_source_rules",
  "content_ideas",
  "content_drafts",
  "content_taste_rules",
  "content_voice",
  "content_posts",
  "content_metrics",
  "content_reviews",
];

describe("0008_content_engine.sql", () => {
  const sql = readFileSync("supabase/migrations/0008_content_engine.sql", "utf8");

  it("creates all nine tables", () => {
    for (const t of TABLES) expect(sql).toContain(`create table public.${t} (`);
  });

  it("lists every table in the RLS + trigger block", () => {
    const block = sql.slice(sql.indexOf("foreach t in array"));
    for (const t of TABLES) expect(block).toContain(`'${t}'`);
    expect(block).toContain("enable row level security");
    expect(block).toContain("touch_updated_at");
  });

  it("gives every table a user_id that cascades from auth.users", () => {
    const count = sql.match(/user_id uuid not null references auth\.users\(id\) on delete cascade/g)?.length ?? 0;
    expect(count).toBe(TABLES.length);
  });
});
