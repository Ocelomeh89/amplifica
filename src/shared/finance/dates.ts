export type YearMonth = string; // "YYYY-MM"

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

export function formatYearMonth({ year, month }: { year: number; month: number }): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const idx = year * 12 + (month - 1) + n;
  const newYear = Math.floor(idx / 12);
  const newMonth = (idx % 12) + 1;
  return formatYearMonth({ year: newYear, month: newMonth });
}

export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const A = parseYearMonth(a);
  const B = parseYearMonth(b);
  return (B.year - A.year) * 12 + (B.month - A.month);
}

export function dateToYearMonth(d: Date): YearMonth {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isoToYearMonth(iso: string): YearMonth {
  return iso.slice(0, 7);
}

export function currentYearMonth(): YearMonth {
  return dateToYearMonth(new Date());
}
