// The Amplicon form's FormData contract, shared by create and edit.
// STI: term_months + interest_pct (loan rate). LTI: term_years (stored as
// months) + interest_pct (annual cash-on-cash rate).

import { num, pct, str } from "@/shared/forms";

export type IncomeType = "STI" | "LTI";

export interface AmpliconFields {
  name: string;
  ai_type: string;
  income_type: IncomeType;
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
