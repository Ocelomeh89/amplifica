// The dashboard projection's own settings: what new projected Amplicons and
// the LoC look like. MSC is not here — it is read from the profile.
//
// FormData parsing deliberately does not use shared/forms.ts's `num`: that
// helper turns a cleared box into 0, which here would mean a 0-month term and
// a database check violation. A cleared or garbage box falls back to the
// field's default instead, and every value is clamped to the table's checks.

import { str } from "@/shared/forms";
import type {
  DashboardProjectionSettingsInsert,
  DashboardProjectionSettingsRow,
} from "@/shared/supabase/database.types";

export interface ProjectionSettings {
  nextDrawSize: number | null; // null = latest Amplicon's face value
  investmentInterestPct: number; // decimal
  termMonths: number;
  locInterestPct: number; // decimal
  locIncrease: number;
  horizonMonths: number;
  startDelayMonths: number;
}

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  nextDrawSize: null,
  investmentInterestPct: 0.08,
  termMonths: 36,
  locInterestPct: 0.1,
  locIncrease: 1.5,
  horizonMonths: 360,
  startDelayMonths: 0,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// A typed number, or null for an absent, blank or non-numeric field.
function readNumber(fd: FormData, key: string): number | null {
  const raw = str(fd, key).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseProjectionSettings(fd: FormData): ProjectionSettings {
  const d = DEFAULT_PROJECTION_SETTINGS;
  const pctOr = (key: string, fallback: number) => {
    const n = readNumber(fd, key);
    return n == null ? fallback : n / 100;
  };
  const draw = readNumber(fd, "next_draw_size");
  const horizonYears = readNumber(fd, "horizon_years");
  return {
    nextDrawSize: draw == null ? null : Math.max(draw, 0),
    investmentInterestPct: clamp(pctOr("investment_interest_pct", d.investmentInterestPct), 0, 0.2),
    termMonths: clamp(Math.round(readNumber(fd, "term_months") ?? d.termMonths), 12, 120),
    locInterestPct: clamp(pctOr("loc_interest_pct", d.locInterestPct), 0, 0.3),
    locIncrease: clamp(readNumber(fd, "loc_increase") ?? d.locIncrease, 1, 2),
    horizonMonths: clamp(Math.round(horizonYears == null ? d.horizonMonths : horizonYears * 12), 60, 600),
    startDelayMonths: clamp(Math.round(readNumber(fd, "start_delay_months") ?? d.startDelayMonths), 0, 5),
  };
}

export function settingsFromRow(row: DashboardProjectionSettingsRow | null): ProjectionSettings {
  if (row == null) return DEFAULT_PROJECTION_SETTINGS;
  // Supabase returns numeric columns as numbers or strings depending on size;
  // Number() normalises both.
  return {
    nextDrawSize: row.next_draw_size == null ? null : Number(row.next_draw_size),
    investmentInterestPct: Number(row.investment_interest_pct),
    termMonths: Number(row.term_months),
    locInterestPct: Number(row.loc_interest_pct),
    locIncrease: Number(row.loc_increase),
    horizonMonths: Number(row.horizon_months),
    startDelayMonths: Number(row.start_delay_months),
  };
}

export function settingsToRow(s: ProjectionSettings): Omit<DashboardProjectionSettingsInsert, "user_id"> {
  return {
    next_draw_size: s.nextDrawSize,
    investment_interest_pct: s.investmentInterestPct,
    term_months: s.termMonths,
    loc_interest_pct: s.locInterestPct,
    loc_increase: s.locIncrease,
    horizon_months: s.horizonMonths,
    start_delay_months: s.startDelayMonths,
  };
}
