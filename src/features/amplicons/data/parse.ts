// The Amplicon form's FormData contract, shared by create and edit.
// STI: term_months + interest_pct (loan rate). LTI: term_years (stored as
// months) + interest_pct (annual cash-on-cash rate) + is_bonus (checkbox: paid
// with the user's own money, not a line-of-credit draw; always false for STI).

import { num, pct, str } from "@/shared/forms";

export type IncomeType = "STI" | "LTI";

export interface AmpliconFields {
  name: string;
  ai_type: string;
  income_type: IncomeType;
  is_bonus: boolean;
  face_value: number;
  term_months: number;
  interest_pct: number;
  start_date: string;
}

export function parseAmpliconForm(fd: FormData): AmpliconFields {
  const income_type: IncomeType = str(fd, "income_type") === "LTI" ? "LTI" : "STI";
  const term_months =
    income_type === "LTI" ? Math.round(num(fd, "term_years") * 12) : num(fd, "term_months");
  const fields: AmpliconFields = {
    name: str(fd, "name").trim(),
    ai_type: str(fd, "ai_type").trim(),
    income_type,
    is_bonus: income_type === "LTI" && str(fd, "is_bonus") === "on",
    face_value: num(fd, "face_value"),
    term_months,
    interest_pct: pct(fd, "interest_pct"),
    start_date: str(fd, "start_date"),
  };
  if (!fields.name || !(fields.face_value > 0) || !(fields.term_months > 0) || !fields.start_date) {
    throw new Error("Missing or invalid required fields.");
  }
  return fields;
}

// Where the face value went: up to 3 rows (alloc_option_i, alloc_pct_i in
// whole points). Empty = not split, which the fund check counts as Default growth.
export interface AllocationField {
  investment_option_id: string;
  pct: number; // decimal
}

export const MAX_ALLOCATIONS = 3;

export function parseAllocations(fd: FormData): AllocationField[] {
  const out: AllocationField[] = [];
  for (let i = 0; i < MAX_ALLOCATIONS; i++) {
    const id = str(fd, `alloc_option_${i}`).trim();
    if (!id) continue;
    const share = pct(fd, `alloc_pct_${i}`);
    if (!(share > 0)) throw new Error("Each share must be above 0%.");
    if (out.some((a) => a.investment_option_id === id)) throw new Error("Use each investment once.");
    out.push({ investment_option_id: id, pct: share });
  }
  if (out.length > 0 && Math.abs(out.reduce((s, a) => s + a.pct, 0) - 1) > 0.0001) {
    throw new Error("Split must add up to 100%.");
  }
  return out;
}
