// The investment-options FormData contracts. Rates arrive in whole points.

import { checkbox, num, pct, str } from "@/shared/forms";
import type { OptionType } from "@/shared/finance/fund-check";
import type { YearMonth } from "@/shared/finance/dates";

const TYPES: OptionType[] = ["amortized", "interest_only", "appreciation"];

export interface OptionFields {
  name: string;
  option_type: OptionType;
  rate_pct: number; // annual decimal
  term_months: number | null; // null = infinite
  liquid: boolean;
}

export function parseOptionForm(fd: FormData): OptionFields {
  const name = str(fd, "name").trim();
  const option_type = str(fd, "option_type") as OptionType;
  const rate_pct = pct(fd, "rate_pct");
  const term_months = checkbox(fd, "term_infinite") ? null : num(fd, "term_months");
  if (
    !name ||
    !TYPES.includes(option_type) ||
    !(rate_pct >= 0) ||
    rate_pct > 1 ||
    (term_months !== null && !(Number.isInteger(term_months) && term_months > 0))
  ) {
    throw new Error("Missing or invalid required fields.");
  }
  return { name, option_type, rate_pct, term_months, liquid: checkbox(fd, "liquid") };
}

/** "2026-11" → "2026-11-01", the date column's form of a month. */
export function monthStart(ym: YearMonth): string {
  return `${ym}-01`;
}

/** The version row an edit writes: the option's terms from the start of `month` on. */
export function versionRow(optionId: string, userId: string, f: OptionFields, month: YearMonth) {
  return {
    option_id: optionId,
    user_id: userId,
    effective_month: monthStart(month),
    option_type: f.option_type,
    rate_pct: f.rate_pct,
    term_months: f.term_months,
    liquid: f.liquid,
  };
}
