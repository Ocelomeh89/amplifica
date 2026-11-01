import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIMENT_KINDS, VARIABLES } from "@/features/content/engine/experiments";
import { COMPETITOR_RUN_STATUSES, CREATOR_STATUSES } from "@/features/content/engine/competitors";
import { SOURCE_KINDS } from "@/features/content/engine/types";

describe("0017_content_competitors.sql", () => {
  const sql = readFileSync("supabase/migrations/0017_content_competitors.sql", "utf8");
  const block = (start: string, end: string) => sql.slice(sql.indexOf(start), end ? sql.indexOf(end) : undefined);
  const creators = block("create table public.content_creators", "create table public.content_competitor_posts");
  const posts = block("create table public.content_competitor_posts", "create table public.content_competitor_runs");
  const runs = block("create table public.content_competitor_runs", "alter table public.content_experiments");
  const listFor = (text: string, col: string) => {
    const m = text.match(new RegExp(`${col} in \\(([^)]*)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };
  const after = (marker: string) => sql.slice(sql.indexOf(`add constraint ${marker}`));

  it("check lists equal the engine constants", () => {
    expect(listFor(creators, "status")).toEqual([...CREATOR_STATUSES].sort());
    expect(listFor(runs, "status")).toEqual([...COMPETITOR_RUN_STATUSES].sort());
    expect(listFor(after("content_experiments_kind_check"), "kind")).toEqual([...EXPERIMENT_KINDS].sort());
    expect(listFor(after("content_experiments_variable_check"), "variable")).toEqual([...VARIABLES].sort());
    expect(listFor(after("content_sources_kind_check"), "kind")).toEqual([...SOURCE_KINDS].sort());
  });

  it("drops the old checks by their default names before adding the new ones", () => {
    for (const c of ["content_experiments_kind_check", "content_experiments_variable_check", "content_sources_kind_check"]) {
      expect(sql).toMatch(new RegExp(`drop constraint ${c}`));
    }
  });

  it("creators are unique per user, platform and username; posts unique per user and shortcode", () => {
    expect(creators).toMatch(/unique \(user_id, platform, username\)/);
    expect(creators).toMatch(/last_pull_status text check \(last_pull_status is null or last_pull_status in \('ready', 'failed'\)\)/);
    expect(posts).toMatch(/unique \(user_id, shortcode\)/);
  });

  it("competitor_post_id sets null on delete; posts cascade from creators", () => {
    expect(sql).toMatch(/competitor_post_id uuid references public\.content_competitor_posts\(id\) on delete set null/);
    expect(posts).toMatch(/creator_id uuid not null references public\.content_creators\(id\) on delete cascade/);
  });

  it("the three tables enable RLS with the four owner policies and the touch trigger", () => {
    expect(sql.match(/enable row level security/gi)?.length).toBe(3);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(15);
    expect(sql.match(/execute function public\.touch_updated_at/g)?.length).toBe(3);
  });
});
