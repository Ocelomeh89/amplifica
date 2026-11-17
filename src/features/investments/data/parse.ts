// The investment-options FormData contracts. Rates arrive in whole points.

import { checkbox, num, pct, str } from "@/shared/forms";
import { DEFAULT_GROWTH_ID, type OptionType } from "@/shared/finance/fund-check";
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

const optionIdOrNull = (raw: string): string | null => (raw === DEFAULT_GROWTH_ID ? null : raw);
const isMonth = (s: string) => /^\d{4}-\d{2}$/.test(s);

export interface MoveFields {
  from_option_id: string | null; // null = Default growth
  to_option_id: string | null;
  amount: number;
  move_month: string;
}

export function parseMoveForm(fd: FormData): MoveFields {
  const from = str(fd, "from");
  const to = str(fd, "to");
  const amount = num(fd, "amount");
  const month = str(fd, "month");
  if (!from || !to || from === to || !(amount > 0) || !isMonth(month)) {
    throw new Error("Pick two different options, an amount above $0 and a month.");
  }
  return { from_option_id: optionIdOrNull(from), to_option_id: optionIdOrNull(to), amount, move_month: monthStart(month) };
}

export interface CheckinFields {
  investment_option_id: string | null; // null = Default growth
  value: number;
  checkin_month: string;
}

export function parseCheckinForm(fd: FormData, today: YearMonth): CheckinFields {
  const option = str(fd, "option");
  const value = num(fd, "value");
  const month = str(fd, "month");
  if (!option || !(value >= 0) || !isMonth(month)) throw new Error("Enter a value of $0 or more and a month.");
  if (month > today) throw new Error("A check-in can't be in the future.");
  return { investment_option_id: optionIdOrNull(option), value, checkin_month: monthStart(month) };
}
