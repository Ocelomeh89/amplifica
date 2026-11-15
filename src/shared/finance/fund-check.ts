// The fund check: does the real fund behind the Amplicons throw off enough
// cash to cover every scheduled Amplicon payment? (Spec 2026-11-10.)
//
// Read-only beside the flywheel: it reads Amplicon schedules through the same
// payoutAtMonth the dashboard uses and changes no engine number.

import { monthlyPayment } from "./amortization";
import { addMonths, monthsBetween, type YearMonth } from "./dates";
import { payoutAtMonth, type AmpliconLite } from "./projection";

export type OptionType = "amortized" | "interest_only" | "appreciation";

export interface OptionTerms {
  optionType: OptionType;
  ratePct: number; // annual decimal
  termMonths: number | null; // null = infinite
  liquid: boolean;
}

// An option's terms from effectiveMonth onward. Edits look forward only.
export interface OptionVersion extends OptionTerms {
  effectiveMonth: YearMonth;
}

export interface FundOption {
  id: string;
  name: string;
  versions: OptionVersion[]; // any order
}

// The built-in holding for Amplicons with no split. A code constant, not a row;
// null option ids in the DB map to it.
export const DEFAULT_GROWTH_ID = "default-growth";
export const DEFAULT_GROWTH: FundOption = {
  id: DEFAULT_GROWTH_ID,
  name: "Default growth",
  versions: [{ effectiveMonth: "0000-01", optionType: "appreciation", ratePct: 0.1, termMonths: null, liquid: true }],
};

// One deposit into a holding. startMonth = the deposit month; it first earns
// the month after (the engine's draw-then-pay convention).
export interface Lot {
  principal: number;
  startMonth: YearMonth;
}

export function termsAt(option: FundOption, month: YearMonth): OptionTerms {
  // An option saved without terms (a half-failed write) behaves as Default growth.
  if (option.versions.length === 0) return termsAt(DEFAULT_GROWTH, month);
  let inEffect: OptionVersion | null = null;
  let earliest: OptionVersion | null = null;
  for (const v of option.versions) {
    if (earliest == null || v.effectiveMonth < earliest.effectiveMonth) earliest = v;
    if (v.effectiveMonth <= month && (inEffect == null || v.effectiveMonth > inEffect.effectiveMonth)) inEffect = v;
  }
  const v = (inEffect ?? earliest) as OptionVersion;
  return { optionType: v.optionType, ratePct: v.ratePct, termMonths: v.termMonths, liquid: v.liquid };
}

// Advance one lot by one month under `terms`; mutates lot.principal.
// Amortized payments are re-solved from the current principal and remaining
// term each month: identical to the fixed schedule when nothing changes, and
// correct after a version change or a check-in rescale.
export function stepLot(lot: Lot, terms: OptionTerms, month: YearMonth): { cash: number; closed: boolean } {
  const k = monthsBetween(lot.startMonth, month);
  if (k <= 0) return { cash: 0, closed: false };
  const r = terms.ratePct / 12;
  const term = terms.termMonths;
  const atTerm = term != null && k >= term;

  if (terms.optionType === "appreciation") {
    lot.principal *= 1 + r;
    if (!atTerm) return { cash: 0, closed: false };
    const cash = lot.principal;
    lot.principal = 0;
    return { cash, closed: true };
  }

  if (terms.optionType === "interest_only") {
    let cash = lot.principal * r;
    if (atTerm) {
      cash += lot.principal;
      lot.principal = 0;
    }
    return { cash, closed: atTerm };
  }

  // amortized
  if (term == null) return { cash: lot.principal * r, closed: false };
  if (atTerm) {
    const cash = lot.principal * (1 + r);
    lot.principal = 0;
    return { cash, closed: true };
  }
  const pay = monthlyPayment(lot.principal, terms.ratePct, term - k + 1);
  lot.principal -= pay - lot.principal * r;
  return { cash: pay, closed: false };
}

// --- The monthly replay -------------------------------------------------------

export interface Allocation {
  optionId: string;
  pct: number; // decimal
}

// A tracked Amplicon plus where its face value went. No allocations = 100% Default growth.
export interface FundAmplicon extends AmpliconLite {
  allocations: Allocation[];
}

export interface FundMove {
  id: string;
  fromId: string; // DEFAULT_GROWTH_ID for Default growth
  toId: string;
  amount: number;
  month: YearMonth;
  stranded?: boolean; // "deleted": the money still leaves the source but lands in Default growth
}

export interface FundCheckin {
  id?: string;
  stranded?: boolean; // "deleted": after the rescale the whole holding moves to Default growth
  optionId: string;
  value: number;
  month: YearMonth;
}

export interface FundCheckInput {
  amplicons: FundAmplicon[];
  options: FundOption[];
  moves: FundMove[];
  checkins: FundCheckin[];
  today: YearMonth;
}

export interface FundMonth {
  month: YearMonth;
  income: number;
  payments: number;
  soldToCover: number;
  uncovered: number;
  liquidValue: number;
  illiquidValue: number;
}

export type FundStatus = "ok" | "short-now" | "runs-out";

export interface FundCheckResult {
  status: FundStatus;
  runOutMonth: YearMonth | null; // first month after today with an uncovered payment
  liquidToday: number;
  liquidAtEnd: number;
  endMonth: YearMonth | null; // last month any Amplicon pays
  unallocatedCount: number;
  cappedMoveIds: string[];
  holdingsToday: Record<string, number>; // option id (incl. DEFAULT_GROWTH_ID) → total principal
  months: FundMonth[];
}

// Below half a cent a shortfall is float noise, not a missed payment.
const EPS = 0.005;

function totalOf(lots: Lot[]): number {
  let t = 0;
  for (const l of lots) t += l.principal;
  return t;
}

// Take `amount` out of a holding, proportionally across its lots; returns what was taken.
function takeFrom(lots: Lot[], amount: number): number {
  const total = totalOf(lots);
  if (total <= 0 || amount <= 0) return 0;
  const taken = Math.min(amount, total);
  const keep = (total - taken) / total;
  for (const l of lots) l.principal *= keep;
  return taken;
}

export function runFundCheck(input: FundCheckInput): FundCheckResult {
  const { amplicons, moves, checkins, today } = input;
  const options = new Map<string, FundOption>();
  options.set(DEFAULT_GROWTH_ID, DEFAULT_GROWTH);
  for (const o of input.options) options.set(o.id, o);
  const unallocatedCount = amplicons.filter((a) => a.allocations.length === 0).length;

  if (amplicons.length === 0) {
    return {
      status: "ok",
      runOutMonth: null,
      liquidToday: 0,
      liquidAtEnd: 0,
      endMonth: null,
      unallocatedCount,
      cappedMoveIds: [],
      holdingsToday: {},
      months: [],
    };
  }

  let firstMonth = addMonths(amplicons[0].startMonth, -1);
  let endMonth = addMonths(amplicons[0].startMonth, amplicons[0].termMonths - 1);
  for (const a of amplicons) {
    const draw = addMonths(a.startMonth, -1);
    const last = addMonths(a.startMonth, a.termMonths - 1);
    if (draw < firstMonth) firstMonth = draw;
    if (last > endMonth) endMonth = last;
  }

  const holdings = new Map<string, Lot[]>();
  for (const id of options.keys()) holdings.set(id, []);
  const lotsOf = (id: string): Lot[] => {
    let lots = holdings.get(id);
    if (!lots) {
      lots = [];
      holdings.set(id, lots);
    }
    return lots;
  };
  const termsFor = (id: string, m: YearMonth): OptionTerms => termsAt(options.get(id) ?? DEFAULT_GROWTH, m);

  // A move dated before the fund exists has nothing to move.
  const cappedMoveIds: string[] = moves.filter((mv) => mv.month < firstMonth).map((mv) => mv.id);

  const months: FundMonth[] = [];
  let holdingsToday: Record<string, number> = {};
  const n = monthsBetween(firstMonth, endMonth);
  for (let i = 0; i <= n; i++) {
    const m = addMonths(firstMonth, i);

    // 1. Deposits: each Amplicon is drawn the month before its first payment.
    for (const a of amplicons) {
      if (addMonths(a.startMonth, -1) !== m) continue;
      const allocs = a.allocations.length > 0 ? a.allocations : [{ optionId: DEFAULT_GROWTH_ID, pct: 1 }];
      for (const al of allocs) lotsOf(al.optionId).push({ principal: a.faceValue * al.pct, startMonth: m });
    }

    // 2. Moves: capped at the source's balance; an illiquid source can't be sold.
    for (const mv of moves) {
      if (mv.month !== m) continue;
      const src = lotsOf(mv.fromId);
      const available = termsFor(mv.fromId, m).liquid ? totalOf(src) : 0;
      if (mv.amount > available + EPS) cappedMoveIds.push(mv.id);
      const moved = takeFrom(src, Math.min(mv.amount, available));
      const dest = mv.stranded ? DEFAULT_GROWTH_ID : mv.toId;
      if (moved > 0) lotsOf(dest).push({ principal: moved, startMonth: m });
    }

    // 3. Growth and income.
    let income = 0;
    for (const [id, lots] of holdings) {
      const t = termsFor(id, m);
      for (const lot of lots) {
        const step = stepLot(lot, t, m);
        income += step.cash;
      }
      holdings.set(id, lots.filter((l) => l.principal > 0 || monthsBetween(l.startMonth, m) <= 0));
    }

    // 4. Check-ins replace the derived value.
    for (const c of checkins) {
      if (c.month !== m) continue;
      const lots = lotsOf(c.optionId);
      const total = totalOf(lots);
      if (total > 0) {
        const f = c.value / total;
        for (const l of lots) l.principal *= f;
      } else if (c.value > 0) {
        lots.push({ principal: c.value, startMonth: m });
      }
      if (c.stranded && c.optionId !== DEFAULT_GROWTH_ID) {
        const strandedValue = takeFrom(lots, totalOf(lots));
        if (strandedValue > 0) lotsOf(DEFAULT_GROWTH_ID).push({ principal: strandedValue, startMonth: m });
      }
    }

    // 5. Payments: income first, then sell liquid holdings, lowest rate first.
    let payments = 0;
    for (const a of amplicons) payments += payoutAtMonth(a, m);
    let shortfall = Math.max(payments - income, 0);
    let soldToCover = 0;
    if (shortfall > 0) {
      const sellable = [...holdings.keys()]
        .filter((id) => termsFor(id, m).liquid)
        .sort((x, y) => termsFor(x, m).ratePct - termsFor(y, m).ratePct || (x < y ? -1 : x > y ? 1 : 0));
      for (const id of sellable) {
        if (shortfall <= 0) break;
        const sold = takeFrom(lotsOf(id), shortfall);
        soldToCover += sold;
        shortfall -= sold;
      }
    }

    // 6. Record.
    let liquidValue = 0;
    let illiquidValue = 0;
    const byOption: Record<string, number> = {};
    for (const [id, lots] of holdings) {
      const v = totalOf(lots);
      if (v > 0) byOption[id] = v;
      if (termsFor(id, m).liquid) liquidValue += v;
      else illiquidValue += v;
    }
    months.push({ month: m, income, payments, soldToCover, uncovered: shortfall, liquidValue, illiquidValue });
    if (m === today) holdingsToday = byOption;
    if (i === n && today > endMonth) holdingsToday = byOption;
  }

  // Past months only build today's balances; their shortfalls are never reported.
  const now = months.find((mo) => mo.month === today);
  const ahead = months.find((mo) => mo.month > today && mo.uncovered > EPS);
  const status: FundStatus = now && now.uncovered > EPS ? "short-now" : ahead ? "runs-out" : "ok";
  const last = months[months.length - 1];
  const liquidToday = today < firstMonth ? 0 : now ? now.liquidValue : last.liquidValue;

  return {
    status,
    runOutMonth: status === "runs-out" && ahead ? ahead.month : null,
    liquidToday,
    liquidAtEnd: last.liquidValue,
    endMonth,
    unallocatedCount,
    cappedMoveIds,
    holdingsToday,
    months,
  };
}

const STATUS_RANK: Record<FundStatus, number> = { ok: 0, "runs-out": 1, "short-now": 2 };

// Does `after` look worse than `before`? A worse status, or the same
// "runs out" with an earlier month. Drives the edit form's "Save anyway".
export function isWorse(
  before: Pick<FundCheckResult, "status" | "runOutMonth">,
  after: Pick<FundCheckResult, "status" | "runOutMonth">
): boolean {
  const a = STATUS_RANK[after.status];
  const b = STATUS_RANK[before.status];
  if (a !== b) return a > b;
  return after.status === "runs-out" && !!after.runOutMonth && !!before.runOutMonth && after.runOutMonth < before.runOutMonth;
}
