import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPETITOR_RUN_STATUSES, CREATOR_STATUSES } from "@/features/content/engine/competitors";
import { CANDIDATE_OUTCOMES, DISCOVERY_RUN_KINDS, DISCOVERY_TRIGGERS } from "@/features/content/engine/discovery";

describe("0023_content_creator_suggestions.sql", () => {
  const sql = readFileSync("supabase/migrations/0023_content_creator_suggestions.sql", "utf8");
  const block = (start: string, end?: string) => sql.slice(sql.indexOf(start), end ? sql.indexOf(end) : undefined);
  const candidates = block("create table public.content_creator_candidates", "create table public.content_discovery_runs");
  const runs = block("create table public.content_discovery_runs", "create table public.content_discovery_calls");
  const calls = block("create table public.content_discovery_calls");
  const listFor = (text: string, col: string) => {
    const m = text.match(new RegExp(`${col} in \\(([^)]*)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };
  const afterConstraint = (marker: string) => sql.slice(sql.indexOf(`add constraint ${marker}`));

  it("the status check equals CREATOR_STATUSES", () => {
    expect(listFor(afterConstraint("content_creators_status_check"), "status")).toEqual([...CREATOR_STATUSES].sort());
    expect(sql).toMatch(/drop constraint content_creators_status_check/);
  });

  it("outcome, kind and trigger checks equal the engine constants", () => {
    expect(listFor(candidates, "outcome")).toEqual([...CANDIDATE_OUTCOMES].sort());
    expect(listFor(runs, "kind")).toEqual([...DISCOVERY_RUN_KINDS].sort());
    expect(listFor(runs, "status")).toEqual([...COMPETITOR_RUN_STATUSES].sort());
    expect(listFor(calls, "trigger")).toEqual([...DISCOVERY_TRIGGERS].sort());
  });

  it("a declined creator must carry a reason", () => {
    expect(sql).toMatch(/status <> 'declined' or decline_reason <> ''/);
    expect(sql).toMatch(/content_creators_decline_reason_check/);
  });

  it("candidates are unique per user and username; confidence is 1 to 5", () => {
    expect(candidates).toMatch(/unique \(user_id, username\)/);
    expect(candidates).toMatch(/confidence is null or confidence between 1 and 5/);
    expect(candidates).toMatch(/reader in \('', 'daniel', 'stephen', 'neither'\)/);
  });

  it("a run is claimed by a unique index on the week, kind and usernames", () => {
    expect(runs + sql.slice(sql.indexOf("content_discovery_runs_claim_idx"))).toMatch(/create unique index content_discovery_runs_claim_idx on public\.content_discovery_runs\(user_id, week_start, kind, usernames\)/);
  });

  it("the three tables enable RLS with the four owner policies", () => {
    expect(sql.match(/enable row level security/gi)?.length).toBe(3);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(15);
  });
});
