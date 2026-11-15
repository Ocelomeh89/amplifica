// The monthly withdrawal goal is typed in dollars but stored, as it always
// was, in thousands of USD (profiles.monthly_cashflow_goal, numeric(10,4)).
// The dashboard multiplies it by 1,000, so the same goal gives the same number.

export function goalDollarsToStored(dollars: number): number {
  return Math.round(dollars * 10) / 10_000; // 4 decimals of thousands = $0.10
}

export function storedGoalToDollars(stored: number | null | undefined): number {
  return Math.round(Number(stored ?? 0) * 100_000) / 100; // to the cent
}
