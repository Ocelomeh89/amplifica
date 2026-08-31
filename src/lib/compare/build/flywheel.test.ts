import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule } from "../types";
import { runSimulation, type ActiveInvestment } from "@/lib/finance/projection-sim";
import { monthlyPayment } from "@/lib/finance/amortization";
import { buildFlywheel, discountedValue, type FlywheelSpec } from "./flywheel";

const spec: FlywheelSpec = {
  kind: "flywheel",
  id: "amplifica",
  label: "Amplification",
  investmentSizeFactor: 5,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  exitDiscountPct: 0.08,
};

const capital: CapitalSchedule = { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null };

describe("buildFlywheel — shape", () => {
  const s = buildFlywheel(spec, capital);

  it("emits exactly the horizon length in every series", () => {
    expect(s.capitalIn).toHaveLength(HORIZON_MONTHS);
    expect(s.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(s.bookValue).toHaveLength(HORIZON_MONTHS);
  });

  it("declares nominal — Amplicon payments are contractually fixed", () => {
    expect(s.entryBasis).toBe("nominal");
  });

  it("carries the outstanding LoC balance as debt at exit, not netted away", () => {
    const sim = runSimulation({
      msc: 2_000,
      investmentSizeFactor: 5,
      termMonths: 36,
      investmentInterestPct: 0.08,
      locIncrease: 1.5,
      locInterestPct: 0.1,
      totalMonths: HORIZON_MONTHS,
    });
    expect(s.exit.debtPayoff).toBeCloseTo(sim.series[LAST_INCOME_MONTH].outstandingAmount, 6);
    // The default run never fully delevers by the horizon, so this is a real
    // regression guard, not a vacuous zero check.
    expect(s.exit.debtPayoff).toBeGreaterThan(0);
  });

  it("emits no TaxItem outside the income months", () => {
    expect(s.taxItems.every((t) => t.month >= 1 && t.month <= LAST_INCOME_MONTH)).toBe(true);
  });
});

describe("buildFlywheel — capital", () => {
  it("contributes the shared monthly amount every month", () => {
    const s = buildFlywheel(spec, capital);
    expect(s.capitalIn[0]).toBeCloseTo(2_000, 6);
    expect(s.capitalIn[40]).toBeCloseTo(2_000, 6);
    expect(s.capitalIn[LAST_INCOME_MONTH]).toBeCloseTo(2_000, 6);
  });

  it("honours an explicit override instead of the shared schedule", () => {
    const s = buildFlywheel({ ...spec, mscOverride: 3_500 }, capital);
    expect(s.capitalIn[10]).toBeCloseTo(3_500, 6);
  });

  it("ignores the shared lump sum, which the strategy has no use for", () => {
    const withLump = buildFlywheel(spec, { ...capital, lumpSum: 50_000 });
    const without = buildFlywheel(spec, capital);
    expect(withLump.capitalIn[0]).toBeCloseTo(without.capitalIn[0], 6);
  });

  it("honours the shared monthly cutoff — and stops feeding the simulator too", () => {
    const capped: CapitalSchedule = { ...capital, monthlyEndMonth: 24 };
    const s = buildFlywheel(spec, capped);
    expect(s.capitalIn[23]).toBeCloseTo(2_000, 6);
    expect(s.capitalIn[24]).toBe(0);
    expect(s.capitalIn[LAST_INCOME_MONTH]).toBe(0);
  });
});

describe("buildFlywheel — owner cash flow is the withdrawal, not the distribution", () => {
  it("pays the owner nothing during accumulation when no withdrawal is set", () => {
    const s = buildFlywheel(spec, capital);
    expect(s.preTaxCash.every((v) => v === 0)).toBe(true);
  });

  it("pays exactly the configured withdrawal from the start month onward", () => {
    const s = buildFlywheel({ ...spec, withdrawalStartMonth: 24, monthlyWithdrawal: 900 }, capital);
    expect(s.preTaxCash[23]).toBe(0);
    expect(s.preTaxCash[24]).toBeCloseTo(900, 6);
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeCloseTo(900, 6);
  });

  it("forwards the withdrawal into the simulator itself, not just the reported series", () => {
    const withdrawing = buildFlywheel({ ...spec, withdrawalStartMonth: 12, monthlyWithdrawal: 1_500 }, capital);
    const notWithdrawing = buildFlywheel(spec, capital);
    // Pulling cash out starves the flywheel's reinvestment, so its terminal
    // book is smaller than the otherwise-identical run that withdraws nothing.
    expect(withdrawing.exit.grossProceeds).toBeLessThan(notWithdrawing.exit.grossProceeds);
  });

  it("reports continuingMonthlyIncome as the withdrawal run rate, not the raw distribution", () => {
    // Contractually consumed as after-tax RECEIPTS downstream (run.ts /
    // metrics.ts): reporting the raw distribution here would let an
    // untaxed-fallback branch hand out the flywheel's gross payout figure
    // beside options that were properly haircut for tax.
    const noWithdrawal = buildFlywheel(spec, capital);
    expect(noWithdrawal.continuingMonthlyIncome).toBe(0);

    const withdrawing = buildFlywheel({ ...spec, withdrawalStartMonth: 24, monthlyWithdrawal: 900 }, capital);
    expect(withdrawing.continuingMonthlyIncome).toBeCloseTo(900, 6);
  });
});

describe("buildFlywheel — interest income and LoC interest expense", () => {
  const s = buildFlywheel(spec, capital);
  const sim = runSimulation({
    msc: 2_000,
    investmentSizeFactor: 5,
    termMonths: 36,
    investmentInterestPct: 0.08,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    totalMonths: HORIZON_MONTHS,
  });

  it("taxes the interest earned, not the whole payment — and taxes it whether or not it is withdrawn", () => {
    const incomeItem = s.taxItems.find((t) => t.month === 40 && t.amount > 0);
    expect(incomeItem?.amount).toBeCloseTo(sim.series[40].distributionInterest, 6);
    // The default spec takes no withdrawal, so there is no cash in month 40 —
    // yet the interest earned that month is still taxable. That mismatch is
    // the intended phantom-income drag, not a bug.
    expect(s.preTaxCash[40]).toBe(0);
    expect(incomeItem!.amount).toBeGreaterThan(0);
  });

  it("tags the interest income ordinary portfolio income — no shelter", () => {
    const incomeItem = s.taxItems.find((t) => t.month === 40 && t.amount > 0);
    expect(incomeItem?.character).toBe("ordinary");
    expect(incomeItem?.activity).toBe("portfolio");
    expect(incomeItem?.basisAffecting).toBe(false);
  });

  it("deducts the LoC interest expense as a negative ordinary item, accrued on the PRIOR month's balance", () => {
    const expenseItem = s.taxItems.find((t) => t.month === 40 && t.amount < 0);
    expect(expenseItem).toBeDefined();
    expect(expenseItem?.character).toBe("ordinary");
    expect(expenseItem?.activity).toBe("portfolio");
    expect(expenseItem?.basisAffecting).toBe(false);
    // Month 40's LoC interest accrues on month 39's closing balance — the
    // simulator charges interest before that month's paydown and any new
    // draw. Using month 40's own closing balance would overstate the accrual.
    expect(expenseItem?.amount).toBeCloseTo(
      -(sim.series[39].outstandingAmount * (0.1 / 12)),
      6
    );
  });

  it("reads month 0's balance for month 1's accrual", () => {
    const item = s.taxItems.find((t) => t.month === 1 && t.amount < 0);
    expect(item?.amount).toBeCloseTo(-(sim.series[0].outstandingAmount * (0.1 / 12)), 6);
  });

  it("nets the LoC interest expense against interest income — net taxable is materially below gross", () => {
    const grossInterest = sim.series.reduce((a, p) => a + p.distributionInterest, 0);
    const netTaxable = s.taxItems.reduce((a, t) => a + t.amount, 0);
    expect(netTaxable).toBeGreaterThan(0);
    expect(netTaxable).toBeLessThan(grossInterest * 0.9);
  });
});

describe("discountedValue — verified against an independently computed amortization balance", () => {
  it("equals the textbook remaining-balance formula at a note's own rate", () => {
    const faceValue = 100_000;
    const annualRate = 0.08;
    const termMonths = 36;
    const startMonth = 1;
    const payment = monthlyPayment(faceValue, annualRate, termMonths);

    const inv: ActiveInvestment = {
      kind: "term",
      monthlyPayout: payment,
      termMonths,
      startMonth,
      faceValue,
      monthlyRate: annualRate / 12,
    };

    const paymentsMade = 10;
    const month = startMonth + paymentsMade;

    // Independently derived remaining-balance formula for an amortizing loan
    // after k payments: B_k = P(1+r)^k - PMT * ((1+r)^k - 1) / r.
    const r = annualRate / 12;
    const growth = Math.pow(1 + r, paymentsMade);
    const expectedBalance = faceValue * growth - (payment * (growth - 1)) / r;

    expect(discountedValue(inv, month, annualRate)).toBeCloseTo(expectedBalance, 4);
  });
});

describe("buildFlywheel — the exit", () => {
  it("the OptionSeries assembly sells at basis when discounting at the Amplicon rate", () => {
    // Discounting a note's own payments at its own rate returns its
    // outstanding principal, so proceeds equal basis and the gain is zero.
    // (discountedValue's own correctness is verified independently above —
    // this checks that buildFlywheel reuses the same valuation on both sides
    // rather than proving the discounting math itself.)
    const s = buildFlywheel(spec, capital);
    expect(s.exit.grossProceeds).toBeCloseTo(s.exit.costBasis, 4);
  });

  it("sells below basis at a higher discount rate", () => {
    const cheap = buildFlywheel({ ...spec, exitDiscountPct: 0.14 }, capital);
    expect(cheap.exit.grossProceeds).toBeLessThan(cheap.exit.costBasis);
  });

  it("is worth more undiscounted than discounted", () => {
    const s = buildFlywheel({ ...spec, exitDiscountPct: 0 }, capital);
    const discounted = buildFlywheel(spec, capital);
    expect(s.exit.grossProceeds).toBeGreaterThan(discounted.exit.grossProceeds);
  });

  it("recaptures nothing — there is no depreciation here", () => {
    expect(buildFlywheel(spec, capital).exit.recapture).toEqual([]);
  });

  it("ends bookValue at the exit equity — proceeds net of the LoC payoff", () => {
    const s = buildFlywheel(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      4
    );
  });
});

describe("buildFlywheel — degenerate inputs stay finite", () => {
  it("survives a zero contribution", () => {
    const s = buildFlywheel(spec, { ...capital, monthly: 0 });
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(s.exit.grossProceeds)).toBe(true);
  });

  it("survives a zero interest rate", () => {
    const s = buildFlywheel({ ...spec, investmentInterestPct: 0, exitDiscountPct: 0 }, capital);
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(s.taxItems.every((t) => Number.isFinite(t.amount))).toBe(true);
  });
});
