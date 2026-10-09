import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROJECTION_SETTINGS,
  parseProjectionSettings,
  settingsFromRow,
  settingsToRow,
} from "./settings";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const full = {
  next_draw_size: "15000",
  investment_interest_pct: "9",
  term_months: "48",
  loc_interest_pct: "7.5",
  loc_increase: "1.25",
  horizon_years: "25",
  start_delay_months: "2",
};

describe("parseProjectionSettings", () => {
  it("reads every field, converting whole percents and years", () => {
    expect(parseProjectionSettings(fd(full))).toEqual({
      nextDrawSize: 15000,
      investmentInterestPct: 0.09,
      termMonths: 48,
      locInterestPct: 0.075,
      locIncrease: 1.25,
      horizonMonths: 300,
      startDelayMonths: 2,
    });
  });

  it("an empty draw-size box means 'use latest Amplicon' (null)", () => {
    expect(parseProjectionSettings(fd({ ...full, next_draw_size: "" })).nextDrawSize).toBeNull();
    expect(parseProjectionSettings(fd({ ...full, next_draw_size: "  " })).nextDrawSize).toBeNull();
  });

  it("caps an absurd next draw size at 1e11", () => {
    expect(parseProjectionSettings(fd({ ...full, next_draw_size: "1e20" })).nextDrawSize).toBe(1e11);
  });

  it("an empty or non-numeric box falls back to that field's default, not 0", () => {
    const s = parseProjectionSettings(fd({ ...full, term_months: "", loc_increase: "abc", horizon_years: "" }));
    expect(s.termMonths).toBe(DEFAULT_PROJECTION_SETTINGS.termMonths);
    expect(s.locIncrease).toBe(DEFAULT_PROJECTION_SETTINGS.locIncrease);
    expect(s.horizonMonths).toBe(DEFAULT_PROJECTION_SETTINGS.horizonMonths);
  });

  it("absent fields fall back to defaults", () => {
    expect(parseProjectionSettings(fd({}))).toEqual(DEFAULT_PROJECTION_SETTINGS);
  });

  it("clamps to the database's ranges and rounds integer fields", () => {
    const s = parseProjectionSettings(
      fd({
        next_draw_size: "-100",
        investment_interest_pct: "45",
        term_months: "6.6",
        loc_interest_pct: "-1",
        loc_increase: "3",
        horizon_years: "80",
        start_delay_months: "7",
      })
    );
    expect(s).toEqual({
      nextDrawSize: 0,
      investmentInterestPct: 0.2,
      termMonths: 12,
      locInterestPct: 0,
      locIncrease: 2,
      horizonMonths: 600,
      startDelayMonths: 5,
    });
  });
});

describe("row mapping", () => {
  it("no row → defaults", () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_PROJECTION_SETTINGS);
  });

  it("round-trips through the row shape (numeric columns may arrive as strings)", () => {
    const s = parseProjectionSettings(fd(full));
    const row = { user_id: "u", created_at: "", updated_at: "", ...(settingsToRow(s) as Required<ReturnType<typeof settingsToRow>>) };
    expect(settingsFromRow(row)).toEqual(s);
    const stringy = { ...row, loc_increase: "1.25" as unknown as number, next_draw_size: "15000.00" as unknown as number };
    expect(settingsFromRow(stringy)).toEqual(s);
  });
});
