import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("0023_amplicon_bonus.sql", () => {
  const sql = readFileSync("supabase/migrations/0023_amplicon_bonus.sql", "utf8");

  it("adds is_bonus defaulting to false, so existing rows keep today's behavior", () => {
    expect(sql).toContain("add column is_bonus boolean not null default false");
  });

  it("only an LTI can be a Bonus", () => {
    expect(sql).toContain("check (not is_bonus or income_type = 'LTI')");
  });
});
