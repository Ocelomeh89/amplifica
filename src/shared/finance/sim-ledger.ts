// The multi-line LoC ledger used by the seeded (dashboard) simulation when the
// user's real lines of credit are passed in. Each line carries its own rate,
// size and balance. The unseeded simulator never touches this module: it keeps
// its single scalar balance, so its arithmetic is unchanged.
//
// Rules (decided 2026-11-01, see docs/PRODUCT-STATUS.md §6):
// - Inflow pays the highest-rate line first (ties: the larger balance).
// - Draws come from the cheapest line with room, spilling to the next; once
//   every line is full the overflow lands on the cheapest line. Limits never
//   cap the math — the dashboard warns instead.

export interface LocLine {
  id: string;
  rate: number; // annual decimal
  size: number; // credit limit; Infinity = unlimited
  balance: number;
}

export function totalBalance(lines: LocLine[]): number {
  let t = 0;
  for (const l of lines) t += l.balance;
  return t;
}

export function totalSize(lines: LocLine[]): number {
  let t = 0;
  for (const l of lines) t += l.size;
  return t;
}

export function accrueLines(lines: LocLine[]): void {
  for (const l of lines) l.balance *= 1 + l.rate / 12;
}

function payOrder(lines: LocLine[]): LocLine[] {
  return lines.slice().sort((a, b) => b.rate - a.rate || b.balance - a.balance);
}

function drawOrder(lines: LocLine[]): LocLine[] {
  // Stable: equal rates keep the caller's order.
  return lines.slice().sort((a, b) => a.rate - b.rate);
}

// Pay `amount` down across the lines; returns what is left over once every
// line is clear (the caller banks it as cash).
export function payDownLines(lines: LocLine[], amount: number): number {
  let left = amount;
  for (const l of payOrder(lines)) {
    if (left <= 0) break;
    const pay = Math.min(l.balance, left);
    l.balance -= pay;
    left -= pay;
  }
  return left;
}

export function borrowFromLines(lines: LocLine[], amount: number): void {
  if (amount <= 0 || lines.length === 0) return;
  const order = drawOrder(lines);
  let left = amount;
  for (const l of order) {
    if (left <= 0) return;
    const room = Math.max(l.size - l.balance, 0);
    const take = Math.min(room, left);
    l.balance += take;
    left -= take;
  }
  if (left > 0) order[0].balance += left;
}

export function cloneLines(lines: LocLine[]): LocLine[] {
  return lines.map((l) => ({ ...l }));
}
