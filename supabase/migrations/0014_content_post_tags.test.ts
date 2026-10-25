import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CTA_TYPES, HOOK_TYPES, MESSAGES, ONSCREEN_TEXT, POST_STYLES } from "@/features/content/engine/tags";

describe("0014_content_post_tags.sql", () => {
  const sql = readFileSync("supabase/migrations/0014_content_post_tags.sql", "utf8");
  const listsFor = (col: string) =>
    [...sql.matchAll(new RegExp(`check \\(${col} in \\(([^)]*)\\)\\)`, "gi"))].map((m) =>
      m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort()
    );

  it.each([
    ["onscreen_text", ONSCREEN_TEXT, 1],
    ["message", MESSAGES, 1],
    ["cta_type", CTA_TYPES, 1],
    ["post_style", POST_STYLES, 1],
    ["hook_type", HOOK_TYPES, 2],
  ] as const)("%s check list equals the engine list plus the empty string", (col, list, tables) => {
    const found = listsFor(col);
    expect(found).toHaveLength(tables);
    for (const f of found) expect(f).toEqual(["", ...list].sort());
  });

  it("adds the tag columns to content_posts only", () => {
    expect(sql).toMatch(/add column onscreen_text text not null default ''/i);
    expect(sql).toMatch(/add column message text not null default ''/i);
    expect(sql).toMatch(/add column cover_face boolean/i);
    expect(sql).toMatch(/add column hook_spoken text not null default ''/i);
    expect(sql).toMatch(/add column tag_confidence jsonb not null default '\{\}'/i);
    expect(sql).toMatch(/add column tag_locks text\[\] not null default '\{\}'/i);
    expect(sql).toMatch(/add column tagged_at timestamptz/i);
  });

  it("touches only content_posts and content_ideas", () => {
    const tables = [...new Set((sql.match(/alter table public\.(\w+)/gi) ?? []).map((s) => s.toLowerCase()))].sort();
    expect(tables).toEqual(["alter table public.content_ideas", "alter table public.content_posts"]);
  });

  it("tells Miguel to check existing hook_type values first", () => {
    expect(sql).toMatch(/select distinct hook_type/i);
  });
});
