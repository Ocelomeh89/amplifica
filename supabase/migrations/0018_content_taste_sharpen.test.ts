import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NOTE_SOURCES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  RULE_STATUSES,
  SHARPEN_STATUSES,
} from "@/features/content/engine/taste";

describe("0018_content_taste_sharpen.sql", () => {
  const sql = readFileSync("supabase/migrations/0018_content_taste_sharpen.sql", "utf8");
  const from = (start: string, end?: string) => sql.slice(sql.indexOf(start), end ? sql.indexOf(end) : undefined);
  const rules = from("alter table public.content_taste_rules", "create table public.content_taste_notes");
  const notes = from("create table public.content_taste_notes", "create table public.content_sharpens");
  const sharpens = from("create table public.content_sharpens", "create table public.content_taste_proposals");
  const proposals = from("create table public.content_taste_proposals");
  const listFor = (text: string, col: string) => {
    const m = text.match(new RegExp(`${col} in \\(([^)]*)\\)`, "i"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort() : null;
  };

  it("check lists equal the engine constants", () => {
    expect(listFor(rules, "status")).toEqual([...RULE_STATUSES].sort());
    expect(listFor(notes, "source")).toEqual([...NOTE_SOURCES].sort());
    expect(listFor(sharpens, "status")).toEqual([...SHARPEN_STATUSES].sort());
    expect(listFor(proposals, "status")).toEqual([...PROPOSAL_STATUSES].sort());
    expect(listFor(proposals, "kind")).toEqual([...PROPOSAL_KINDS].sort());
  });

  it("backfills status from active before enforcing that they agree", () => {
    const backfill = sql.indexOf("update public.content_taste_rules set status");
    expect(backfill).toBeGreaterThan(-1);
    expect(sql).toMatch(/case when active then 'active' else 'off' end/);
    expect(sql.indexOf("check (active = (status = 'active'))")).toBeGreaterThan(backfill);
  });

  it("one live sharpen per idea; sharpens cascade with the idea; notes keep their text when the idea goes", () => {
    expect(sql).toMatch(/create unique index \w+ on public\.content_sharpens\s*\(idea_id\)\s*where status in \('pending', 'ready'\)/);
    expect(sharpens).toMatch(/idea_id uuid not null references public\.content_ideas\(id\) on delete cascade/);
    expect(notes).toMatch(/idea_id uuid references public\.content_ideas\(id\) on delete set null/);
  });

  it("rules gain note_ids and proposal_id", () => {
    expect(sql).toMatch(/add column note_ids uuid\[\] not null default '\{\}'/);
    expect(sql).toMatch(/add column proposal_id uuid/);
  });

  it("sharpens carry the chips and text so Try again needs no second note", () => {
    expect(sharpens).toMatch(/chips text\[\] not null default '\{\}'/);
    expect(sharpens).toMatch(/text text not null default ''/);
  });

  it("the three new tables enable RLS with the four owner policies and the touch trigger", () => {
    expect(sql.match(/enable row level security/gi)?.length).toBe(3);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(15);
    expect(sql.match(/execute function public\.touch_updated_at/g)?.length).toBe(3);
  });

  it("content_apply_taste_proposal runs as the caller and filters every write by p_user", () => {
    const fn = from("create or replace function public.content_apply_taste_proposal");
    expect(fn).toMatch(/security invoker/);
    expect(fn).toMatch(/p_user uuid, p_proposal uuid, p_inserts jsonb, p_evidence jsonb, p_notes uuid\[\], p_at timestamptz/);
    expect(fn.match(/p_user/g)!.length).toBeGreaterThanOrEqual(5);
    expect(fn).toMatch(/where user_id = p_user/);
  });
});
