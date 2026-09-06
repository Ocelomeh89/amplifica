// Hand-runner for the comparison engine. Not a test — it asserts nothing and
// exists to print a readable side-by-side so the numbers can be checked
// against outside judgement. Run it with:
//   pnpm vitest run src/lib/compare/scenario.manual.test.ts

import { it } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const usd = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number | null, d = 2) => (n === null ? "n/a" : (n * 100).toFixed(d) + "%");
const mo = (v: number | null) => (v === null ? "never" : `mo ${v}`);

// Miguel's profile: MFJ, ~$400k gross, no state income tax.
function globals(over: Partial<GlobalInputs["tax"]> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    // Every option now consumes this in full; whatever it does not absorb
    // sits in the sleeve at idleYieldPct. $135,000 is the duplex's own outlay
    // ($125,000 down plus $10,000 closing), so it buys at month 0 here.
    capital: { lumpSum: 135_000, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0.04 },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
      ...over,
    },
  };
}

const indexFund: OptionSpec = {
  kind: "index",
  id: "index",
  label: "Index fund",
  returnPct: { bear: 0.02, base: 0.07, bull: 0.1 },
};

const dividend: OptionSpec = {
  kind: "dividend",
  id: "dividend",
  label: "Dividend portfolio",
  dividendYieldPct: 0.036,
  priceGrowthPct: { bear: 0, base: 0.04, bull: 0.06 },
};

const paydown: OptionSpec = {
  kind: "debt",
  id: "debt",
  label: "Pay down the LoC",
  balance: 50_000,
  ratePct: 0.1,
  termMonths: 240,
  deductible: false,
};

const hysa: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "HYSA 4%",
  yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
};

const duplex: OptionSpec = {
  kind: "rental",
  id: "duplex",
  label: "Duplex",
  purchasePrice: 500_000,
  downPct: 0.25,
  closingCostPct: 0.02,
  mortgageRatePct: 0.065,
  mortgageTermMonths: 360,
  monthlyRent: 3_500,
  rentGrowthPct: 0.03,
  vacancyPct: 0.06,
  operatingExpensePct: 0.35,
  landPct: 0.2,
  depreciationYears: 27.5,
  sellingCostPct: 0.06,
  appreciationPct: { bear: 0, base: 0.035, bull: 0.06 },
};

const flywheel: OptionSpec = {
  kind: "flywheel",
  id: "amplifica",
  label: "Flywheel",
  investmentSizeFactor: 5,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  exitDiscountPct: 0.08,
};

interface Column {
  label: string;
  g: GlobalInputs;
  spec: OptionSpec;
}

function table(title: string, note: string, columns: Column[]) {
  const r = columns.map((c) => runComparison(c.g, [c.spec]).options[0]);

  const rows: [string, (i: number) => string][] = [
    ["Cash collected (today's $)", (i) => usd(r[i].metrics.totalCashCollected)],
    ["  average per month", (i) => usd(r[i].metrics.averageMonthlyCashFlow)],
    ["  year-7 per month", (i) => usd(r[i].metrics.yearSevenMonthlyCashFlow)],
    ["Sale proceeds after tax", (i) => usd(r[i].metrics.exitProceeds)],
    ["Continuing income /mo", (i) => usd(r[i].metrics.continuingMonthlyIncome)],
    ["Peak capital at risk", (i) => usd(r[i].metrics.peakCapitalAtRisk)],
    ["IRR nominal", (i) => pct(r[i].metrics.irrNominal)],
    ["IRR real", (i) => pct(r[i].metrics.irrReal)],
    ["Equity multiple", (i) => r[i].metrics.equityMultiple?.toFixed(3) ?? "n/a"],
    ["Payback, cash only", (i) => mo(r[i].metrics.paybackMonth)],
    ["Payback incl. sale", (i) => mo(r[i].metrics.paybackMonthIncludingSale)],
    ["Total tax paid (nominal)", (i) => usd(r[i].taxPaid.reduce((a, v) => a + v, 0))],
  ];

  const w = 27;
  const cw = 16;
  const width = w + cw * columns.length;
  console.log(`\n${"=".repeat(width)}\n${title}\n${note}\n${"=".repeat(width)}`);
  console.log("".padEnd(w) + columns.map((c) => c.label.padStart(cw)).join(""));
  console.log("-".repeat(width));
  for (const [label, fn] of rows) {
    console.log(label.padEnd(w) + columns.map((_, i) => fn(i).padStart(cw)).join(""));
  }
}

function contrib(): GlobalInputs {
  const g = globals();
  return {
    ...g,
    capital: { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null, idleYieldPct: 0.04 },
  };
}

it("comparison runner", () => {
  table(
    "SAME $135,000, SAME 7 YEARS - MFJ $400k, no state tax, 3% inflation",
    "Duplex: $500k, 25% down, 6.5%/30yr, $3,500 rent +3%/yr, 6% vacancy, 35% opex, 3.5% appreciation",
    [
      { label: "HYSA 4%", g: globals(), spec: hysa },
      { label: "Duplex", g: globals(), spec: duplex },
      { label: "Duplex + REPS", g: globals({ realEstateProfessional: true }), spec: duplex },
    ]
  );

  table(
    "ALL SIX - $2,000/mo, no lump sum, idle cash at 4%",
    "Every option consumes the same schedule in full; whatever it cannot absorb sits in the sleeve.",
    [
      { label: "Flywheel", g: contrib(), spec: flywheel },
      { label: "HYSA 4%", g: contrib(), spec: hysa },
      { label: "Index 7%", g: contrib(), spec: indexFund },
      { label: "Dividend", g: contrib(), spec: dividend },
      { label: "LoC @10%", g: contrib(), spec: paydown },
    ]
  );

  table(
    "THE SAME DUPLEX IN THREE MARKETS",
    "Appreciation only: bear 0%/yr, base 3.5%/yr, bull 6%/yr. Rent and expenses unchanged.",
    [
      { label: "Bear 0%", g: { ...globals(), scenario: "bear" }, spec: duplex },
      { label: "Base 3.5%", g: globals(), spec: duplex },
      { label: "Bull 6%", g: { ...globals(), scenario: "bull" }, spec: duplex },
    ]
  );
});
