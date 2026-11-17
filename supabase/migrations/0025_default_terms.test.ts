import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_PROJECTION_SETTINGS } from "@/features/dashboard/settings";

describe("0025_default_terms.sql", () => {
  const sql = readFileSync("supabase/migrations/0025_default_terms.sql", "utf8");

  it("sets STI defaults to 30 months at 10% and LoC to 7% on both tables", () => {
    for (const table of ["public.projections", "public.dashboard_projection_settings"]) {
      const block = sql.slice(sql.indexOf(`alter table ${table}\n`)).split(";")[0];
      expect(block).toContain("alter column term_months set default 30");
      expect(block).toContain("alter column investment_interest_pct set default 0.10");
      expect(block).toContain("alter column loc_interest_pct set default 0.07");
    }
  });

  it("matches DEFAULT_PROJECTION_SETTINGS", () => {
    const d = DEFAULT_PROJECTION_SETTINGS;
    expect(sql).toContain(`term_months set default ${d.termMonths}`);
    expect(sql).toContain(`investment_interest_pct set default ${d.investmentInterestPct.toFixed(2)}`);
    expect(sql).toContain(`loc_interest_pct set default ${d.locInterestPct.toFixed(2)}`);
  });

  it("changes defaults only, never existing rows", () => {
    expect(sql).not.toMatch(/\bupdate\b/i);
  });
});
