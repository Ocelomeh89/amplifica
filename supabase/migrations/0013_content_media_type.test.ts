import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MEDIA_TYPES } from "@/features/content/engine/types";

describe("0013_content_media_type.sql", () => {
  const sql = readFileSync("supabase/migrations/0013_content_media_type.sql", "utf8");
  it("adds media_type with a check list equal to MEDIA_TYPES plus the empty string", () => {
    const m = /check \(media_type in \(([^)]*)\)\)/i.exec(sql);
    expect(m).not.toBeNull();
    const listed = m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort();
    expect(listed).toEqual(["", ...MEDIA_TYPES].sort());
    expect(sql).toMatch(/add column media_type text not null default ''/i);
  });
  it("adds thumbnail_url and touches no other table", () => {
    expect(sql).toMatch(/add column thumbnail_url text not null default ''/i);
    expect(sql.match(/alter table public\.(\w+)/gi)).toEqual(["alter table public.content_posts"]);
  });
});
