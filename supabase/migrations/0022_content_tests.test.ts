import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TEST_KINDS, TEST_STATUSES, TEST_TRIGGERS, TEST_VARIABLES, TEST_VERDICTS } from "@/features/content/engine/test-lab-verdict";

describe("0022_content_tests.sql", () => {
  const sql = readFileSync("supabase/migrations/0022_content_tests.sql", "utf8");
  const tests = sql.slice(sql.indexOf("create table public.content_tests"), sql.indexOf("create table public.content_test_versions"));
  const versions = sql.slice(sql.indexOf("create table public.content_test_versions"));
  const listFor = (block: string, col: string) => {
    const m = block.match(new RegExp(`${col}\\s+(?:text|smallint)?\\s*(?:not null )?(?:default '[a-z]*'\\s*)?check \\((?:${col} is null or )?${col} in \\(([^)]*)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };

  it("kind, variable, status, verdict, trigger and label check lists equal the constants", () => {
    expect(listFor(tests, "kind")).toEqual([...TEST_KINDS].sort());
    expect(listFor(tests, "variable")).toEqual([...TEST_VARIABLES].sort());
    expect(listFor(tests, "status")).toEqual([...TEST_STATUSES].sort());
    expect(listFor(tests, "verdict")).toEqual([...TEST_VERDICTS].sort());
    expect(listFor(tests, "trigger")).toEqual([...TEST_TRIGGERS].sort());
    expect(listFor(versions, "label")).toEqual(["a", "b"]);
  });

  it("allows one live test per owner", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.content_tests\s*\(user_id\)\s*where status in \('proposing', 'open'\)/i);
  });

  it("a post is on at most one version, and a version is unique per test", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.content_test_versions\s*\(post_id\)\s*where post_id is not null/i);
    expect(versions).toMatch(/unique \(test_id, label\)/i);
    expect(versions).toMatch(/test_id uuid not null references public\.content_tests\(id\) on delete cascade/i);
    expect(versions).toMatch(/idea_id uuid references public\.content_ideas\(id\) on delete set null/i);
    expect(versions).toMatch(/post_id uuid references public\.content_posts\(id\) on delete set null/i);
  });

  it("adds is_test to content_posts", () => {
    expect(sql).toMatch(/alter table public\.content_posts\s+add column is_test boolean not null default false/i);
  });

  it("both tables enable RLS with eight owner policies and the touch trigger", () => {
    expect(sql.match(/enable row level security/gi)?.length).toBe(2);
    expect(sql.match(/create policy/gi)?.length).toBe(8);
    expect(sql.match(/execute function public\.touch_updated_at/g)?.length).toBe(2);
  });

  it("a proposing row has no kind, variable, values or rule yet", () => {
    for (const col of ["kind", "variable", "value_a", "value_b", "rule"]) {
      expect(tests).not.toMatch(new RegExp(`\\b${col}\\s+(?:text|smallint)[^,\\n]*not null`, "i"));
    }
    expect(tests).toMatch(/rule smallint check \(rule between 1 and 5\)/i);
  });
});
