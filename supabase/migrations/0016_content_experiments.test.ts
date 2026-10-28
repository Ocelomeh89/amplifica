import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIMENT_KINDS, EXPERIMENT_STATUSES, RUN_KINDS, RUN_STATUSES, VARIABLES, VERDICTS } from "@/features/content/engine/experiments";

describe("0016_content_experiments.sql", () => {
  const sql = readFileSync("supabase/migrations/0016_content_experiments.sql", "utf8");
  const exp = sql.slice(sql.indexOf("create table public.content_experiments"), sql.indexOf("create table public.content_today_runs"));
  const runs = sql.slice(sql.indexOf("create table public.content_today_runs"));
  const listFor = (block: string, col: string) => {
    const m = block.match(new RegExp(`${col} in \\(([^)]*)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };

  it("variable, kind, status and verdict check lists equal the engine constants", () => {
    expect(listFor(exp, "variable")).toEqual([...VARIABLES].sort());
    expect(listFor(exp, "kind")).toEqual([...EXPERIMENT_KINDS].sort());
    expect(listFor(exp, "status")).toEqual([...EXPERIMENT_STATUSES].sort());
    expect(listFor(exp, "verdict")).toEqual([...VERDICTS].sort());
  });

  it("idea_id cascades and is unique among live rows; post_id sets null", () => {
    expect(exp).toMatch(/idea_id uuid not null references public\.content_ideas\(id\) on delete cascade/i);
    expect(sql).toMatch(/create unique index \w+ on public\.content_experiments\s*\(idea_id\)\s*where status in \('open', 'posted', 'judged', 'unjudged'\)/i);
    expect(exp).toMatch(/post_id uuid references public\.content_posts\(id\) on delete set null/i);
  });

  it("has a partial unique index on (user_id, day, slot) for live statuses", () => {
    expect(sql).toMatch(
      /create unique index \w+ on public\.content_experiments\s*\(user_id, day, slot\)\s*where status in \('open', 'posted', 'judged', 'unjudged'\)/i
    );
  });

  it("today_runs has a partial unique on (user_id, day) for the cron kind and a status check", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.content_today_runs\s*\(user_id, day\)\s*where kind = 'cron'/i);
    expect(listFor(runs, "kind")).toEqual([...RUN_KINDS].sort());
    expect(listFor(runs, "status")).toEqual([...RUN_STATUSES].sort());
  });

  it("both tables enable RLS with the four owner policies and the touch trigger", () => {
    expect(sql.match(/enable row level security/gi)?.length).toBe(2);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(10);
    expect(sql.match(/execute function public\.touch_updated_at/g)?.length).toBe(2);
  });
});
