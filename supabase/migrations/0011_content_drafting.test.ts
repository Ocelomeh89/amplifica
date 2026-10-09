import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Applied by hand in the Supabase SQL editor, like 0008 and 0009.
describe("0011_content_drafting.sql", () => {
  const sql = readFileSync("supabase/migrations/0011_content_drafting.sql", "utf8");
  it("adds obsidian_path to content_ideas", () => {
    expect(sql).toMatch(/alter table public\.content_ideas\s+add column if not exists obsidian_path text/i);
  });
  it("defines the store function with the two error codes and a row lock", () => {
    expect(sql).toContain("create or replace function public.content_store_draft");
    expect(sql).toContain("raise exception 'idea_not_queued'");
    expect(sql).toContain("raise exception 'draft_exists'");
    expect(sql).toMatch(/for update/i);
  });
  it("pins the function search_path", () => {
    expect(sql).toMatch(/language plpgsql\s+set search_path = public, pg_temp/i);
  });
  it("writes both versions and the path in the one function", () => {
    expect(sql).toMatch(/values\s*\([^)]*1, 'raw'[^)]*\),\s*\([^)]*2, 'humanized'/is);
    expect(sql).toMatch(/update public\.content_ideas set obsidian_path/i);
  });
  it("is callable only by the service role", () => {
    expect(sql).toMatch(/revoke all on function public\.content_store_draft\([^)]*\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.content_store_draft\([^)]*\) to service_role/i);
  });
});
