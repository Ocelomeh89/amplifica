import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Applied by hand in the Supabase SQL editor, like 0008–0018. Assert the parts that matter.
describe("0019_investment_options.sql", () => {
  const sql = readFileSync("supabase/migrations/0019_investment_options.sql", "utf8");
  const policies = (table: string) =>
    [...sql.matchAll(new RegExp(`create policy "${table}: self (\\w+)"`, "g"))].map((m) => m[1]).sort();

  it("creates all six tables", () => {
    const m = sql.match(
      /create table public\.(investment_options|investment_option_versions|amplicon_splits|amplicon_allocations|fund_moves|holding_checkins) /g
    );
    expect(m).toHaveLength(6);
  });

  it("enables RLS on each and scopes every policy to the owner", () => {
    expect(sql.match(/enable row level security/g)).toHaveLength(6);
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(18);
  });

  it("splits and allocations are insert-only, so history is never lost", () => {
    expect(policies("amplicon_splits")).toEqual(["insert", "select"]);
    expect(policies("amplicon_allocations")).toEqual(["insert", "select"]);
  });

  it("moves and check-ins are stranded, never deleted", () => {
    expect(policies("fund_moves")).toEqual(["insert", "select", "update"]);
    expect(policies("holding_checkins")).toEqual(["insert", "select", "update"]);
    expect(sql.match(/stranded_at timestamptz/g)).toHaveLength(2);
  });

  it("every reference stays inside one user's rows", () => {
    for (const fk of [
      "foreign key (option_id, user_id) references public.investment_options(id, user_id) on delete cascade",
      "foreign key (amplicon_id, user_id) references public.amplicons(id, user_id) on delete cascade",
      "foreign key (split_id, user_id) references public.amplicon_splits(id, user_id) on delete cascade",
      "foreign key (investment_option_id, user_id) references public.investment_options(id, user_id) on delete restrict",
      "foreign key (from_option_id, user_id) references public.investment_options(id, user_id) on delete restrict",
      "foreign key (to_option_id, user_id) references public.investment_options(id, user_id) on delete restrict",
    ]) {
      expect(sql).toContain(fk);
    }
  });

  it("saves a split atomically with the caller's rights", () => {
    expect(sql).toMatch(/create or replace function public\.save_amplicon_split\(p_amplicon_id uuid, p_allocations jsonb\)/);
    expect(sql).toMatch(/security invoker/);
  });

  it("keeps one version per option per month", () => {
    expect(sql).toMatch(/unique \(option_id, effective_month\)/);
  });

  it("only touches existing tables to add the owner key on amplicons", () => {
    const alters = sql.match(/alter table public\.(profiles|amplicons|locs|projections|dashboard_projection_settings)[^;]*;/gi) ?? [];
    expect(alters).toEqual(["alter table public.amplicons add constraint amplicons_id_user_id_key unique (id, user_id);"]);
  });
});
