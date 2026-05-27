import { monthlyPayment, remainingPrincipalAfter } from "./amortization";
import { addMonths, monthsBetween, type YearMonth } from "./dates";

export interface AmpliconLite {
  id: string;
  faceValue: number;
  interestPct: number;
  termMonths: number;
  startMonth: YearMonth;
}

export interface ProjectionInput {
  amplicons: AmpliconLite[];
  externalNetWorth: number;
  range: "inception" | "current";
  today: YearMonth;
}

export interface ProjectionPoint {
  month: YearMonth;
  monthIndex: number;
  cashFlow: number;
  netWorth: number;
}

export function monthlyPayoutOf(inv: AmpliconLite): number {
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
}

export function isActiveAt(inv: AmpliconLite, month: YearMonth): boolean {
  const elapsed = monthsBetween(inv.startMonth, month);
  return elapsed >= 0 && elapsed < inv.termMonths;
}

export function pvAtMonth(inv: AmpliconLite, month: YearMonth): number {
  const elapsed = monthsBetween(inv.startMonth, month);
  if (elapsed < 0) return 0;
  if (elapsed >= inv.termMonths) return 0;
  return remainingPrincipalAfter(
    inv.faceValue,
    inv.interestPct,
    inv.termMonths,
    elapsed
  );
}

export function buildSeries(input: ProjectionInput): ProjectionPoint[] {
  const { amplicons, externalNetWorth, range, today } = input;

  if (amplicons.length === 0) {
    return [{ month: today, monthIndex: 0, cashFlow: 0, netWorth: externalNetWorth }];
  }

  const earliestStart = amplicons.reduce<YearMonth>((acc, inv) => {
    return monthsBetween(inv.startMonth, acc) > 0 ? inv.startMonth : acc;
  }, amplicons[0].startMonth);

  const latestEnd = amplicons.reduce<YearMonth>((acc, inv) => {
    const end = addMonths(inv.startMonth, inv.termMonths);
    return monthsBetween(end, acc) > 0 ? end : acc;
  }, addMonths(amplicons[0].startMonth, amplicons[0].termMonths));

  const lastActiveMonth = addMonths(latestEnd, -1);
  const startMonth: YearMonth = range === "inception" ? earliestStart : today;

  const length = monthsBetween(startMonth, lastActiveMonth) + 1;
  if (length <= 0) {
    return [{ month: startMonth, monthIndex: 0, cashFlow: 0, netWorth: externalNetWorth }];
  }

  const series: ProjectionPoint[] = [];
  for (let i = 0; i < length; i++) {
    const month = addMonths(startMonth, i);
    let cashFlow = 0;
    let pvTotal = 0;
    for (const inv of amplicons) {
      if (isActiveAt(inv, month)) cashFlow += monthlyPayoutOf(inv);
      pvTotal += pvAtMonth(inv, month);
    }
    series.push({
      month,
      monthIndex: i,
      cashFlow,
      netWorth: externalNetWorth + pvTotal,
    });
  }
  return series;
}
