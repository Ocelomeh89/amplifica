import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Applied by hand in the Supabase SQL editor, like 0008–0018. Assert the parts that matter.
describe("0019_investment_options.sql", () => {
  const sql = readFileSync("supabase/migrations/0019_investment_options.sql", "utf8");

  it("creates all five tables", () => {
    const m = sql.match(
      /create table public\.(investment_options|investment_option_versions|amplicon_allocations|fund_moves|holding_checkins) /g
    );
    expect(m).toHaveLength(5);
  });

  it("enables RLS on each and scopes every policy to the owner", () => {
    expect(sql.match(/enable row level security/g)).toHaveLength(5);
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(20);
  });

  it("protects options in use", () => {
    expect(sql).toContain(
      "investment_option_id uuid not null references public.investment_options(id) on delete restrict"
    );
    expect(sql).toContain("from_option_id uuid references public.investment_options(id) on delete restrict");
    expect(sql).toContain("to_option_id uuid references public.investment_options(id) on delete restrict");
  });

  it("deletes a split with its Amplicon", () => {
    expect(sql).toContain("amplicon_id uuid not null references public.amplicons(id) on delete cascade");
  });

  it("keeps one version per option per month", () => {
    expect(sql).toMatch(/unique \(option_id, effective_month\)/);
  });

  it("alters no existing table", () => {
    expect(sql).not.toMatch(/alter table public\.(profiles|amplicons|locs|projections|dashboard_projection_settings)/i);
  });
});
