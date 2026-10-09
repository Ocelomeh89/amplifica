import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_PROJECTION_SETTINGS } from "@/features/dashboard/settings";

// Applied by hand in the Supabase SQL editor, like 0008–0010. Assert the parts that matter.
describe("0012_dashboard_projection_settings.sql", () => {
  const sql = readFileSync("supabase/migrations/0012_dashboard_projection_settings.sql", "utf8");

  it("is one row per user and enables RLS with self-only policies", () => {
    expect(sql).toMatch(/user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(3);
  });

  it("alters no existing table", () => {
    expect(sql).not.toMatch(/alter table public\.(profiles|amplicons|locs|projections)/i);
  });

  it("column defaults match DEFAULT_PROJECTION_SETTINGS", () => {
    const d = DEFAULT_PROJECTION_SETTINGS;
    expect(sql).toContain(`investment_interest_pct numeric(5, 4) not null default ${d.investmentInterestPct.toFixed(2)}`);
    expect(sql).toContain(`term_months integer not null default ${d.termMonths}`);
    expect(sql).toContain(`loc_interest_pct numeric(5, 4) not null default ${d.locInterestPct.toFixed(2)}`);
    expect(sql).toContain(`loc_increase numeric(4, 2) not null default ${d.locIncrease.toFixed(2)}`);
    expect(sql).toContain(`horizon_months integer not null default ${d.horizonMonths}`);
    expect(sql).toContain(`start_delay_months integer not null default ${d.startDelayMonths}`);
  });
});
