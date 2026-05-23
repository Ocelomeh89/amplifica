export interface AmortizationRow {
  monthIndex: number; // 0-indexed within the loan's own timeline
  payment: number;
  interest: number;
  principal: number;
  remainingPrincipal: number;
}

export function monthlyPayment(principal: number, aprPct: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  if (aprPct === 0) return principal / termMonths;
  const r = aprPct / 12;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

export function amortizationSchedule(
  principal: number,
  aprPct: number,
  termMonths: number
): AmortizationRow[] {
  const pmt = monthlyPayment(principal, aprPct, termMonths);
  const r = aprPct / 12;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let i = 0; i < termMonths; i++) {
    const interest = balance * r;
    const principalPaid = Math.min(pmt - interest, balance);
    balance -= principalPaid;
    rows.push({
      monthIndex: i,
      payment: pmt,
      interest,
      principal: principalPaid,
      remainingPrincipal: balance,
    });
  }
  // final adjustment to make sure rounding doesn't leave dust
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    last.remainingPrincipal = 0;
  }
  return rows;
}

export function remainingPrincipalAfter(
  principal: number,
  aprPct: number,
  termMonths: number,
  monthsElapsed: number
): number {
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= termMonths) return 0;
  const schedule = amortizationSchedule(principal, aprPct, termMonths);
  return schedule[monthsElapsed - 1].remainingPrincipal;
}
