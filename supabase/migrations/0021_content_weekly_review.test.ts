import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PILLAR_TOPICS } from "@/features/content/engine/brand";

describe("0021_content_weekly_review.sql", () => {
  const sql = readFileSync("supabase/migrations/0021_content_weekly_review.sql", "utf8");
  it("seeds every PILLAR_TOPICS slug with its pillar", () => {
    for (const [pillar, topics] of Object.entries(PILLAR_TOPICS)) {
      for (const t of topics) {
        expect(sql).toContain(`'${t.slug}'`);
        expect(sql).toContain(t.label.replace(/'/g, "''"));
        expect(sql).toContain(`'${pillar}'`);
      }
    }
  });

  it("creates the three tables with RLS and four policies each", () => {
    expect((sql.match(/enable row level security/g) ?? []).length).toBe(3);
    for (const table of ["content_topics", "content_focus", "content_account_stats"]) {
      expect(sql).toMatch(new RegExp(`create table public\\.${table}\\b`));
      expect((sql.match(new RegExp(`create policy ${table}_(select|insert|update|delete) on public\\.${table}`, "g")) ?? []).length).toBe(4);
    }
  });

  it("the focus check lists are exact", () => {
    const at = sql.indexOf("create table public.content_focus");
    const block = sql.slice(at, sql.indexOf(");", at));
    const list = (col: string) => {
      const m = block.match(new RegExp(`${col}[^\\n]*check \\(${col} in \\(([^)]*)\\)`));
      return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
    };
    expect(list("kind")).toEqual(["double_down", "skip"]);
    expect(list("dimension")).toEqual(["hook_type", "topic"]);
    expect(list("source")).toEqual(["review", "test"]);
  });

  it("adds topic to posts and ideas, inbox_since to ideas, review and built_at to reviews", () => {
    expect(sql).toMatch(/alter table public\.content_posts\s+add column topic text not null default ''/);
    expect(sql).toMatch(/alter table public\.content_ideas\s+add column topic text not null default '',\s*add column inbox_since timestamptz/);
    expect(sql).toMatch(/alter table public\.content_reviews\s+add column review jsonb not null default '\{\}'::jsonb,\s*add column built_at timestamptz/);
  });

  it("the review unique index is partial on source = 'review'", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.content_focus\s*\(user_id, review_week, kind, dimension, value\)\s*where source = 'review'/);
  });
});
