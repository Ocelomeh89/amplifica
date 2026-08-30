// Temporary hand-runner for the comparison engine. Not a test — it asserts
// nothing and exists to print a readable breakdown of a scenario so the
// numbers can be checked against outside judgement.

import { it } from "vitest";
import type { GlobalInputs, FilingStatus } from "./types";
import { runComparison, type OptionSpec } from "./run";

const usd = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "n/a" : (n * 100).toFixed(2) + "%");

const hysa: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "High-yield savings",
  yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
};

function globals(over: {
  filingStatus?: FilingStatus;
  otherIncome?: number;
  stateRate?: number;
  inflation?: number;
  lumpSum?: number;
  monthly?: number;
  niit?: boolean;
}): GlobalInputs {
  return {
    inflationPct: over.inflation ?? 0.03,
    scenario: "base",
    display: "real",
    capital: {
      lumpSum: over.lumpSum ?? 100_000,
      monthly: over.monthly ?? 2_000,
      monthlyEndMonth: null,
    },
    tax: {
      filingStatus: over.filingStatus ?? "mfj",
      otherOrdinaryIncome: over.otherIncome ?? 400_000,
      stateRatePct: over.stateRate ?? 0.05,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: over.niit ?? true,
      qbiEnabled: false,
    },
  };
}

function report(label: string, g: GlobalInputs) {
  const o = runComparison(g, [hysa])[
    "options"
  ][0];

  const preTax = o.preTaxCash.reduce((a, v) => a + v, 0);
  const tax = o.taxPaid.reduce((a, v) => a + v, 0);
  const capital = g.capital.lumpSum + g.capital.monthly * 83;

  console.log(`\n${"=".repeat(74)}\n${label}\n${"=".repeat(74)}`);
  console.log(
    `  ${g.tax.filingStatus.toUpperCase()} · other income ${usd(g.tax.otherOrdinaryIncome)} · ` +
      `state ${(g.tax.stateRatePct * 100).toFixed(0)}% · NIIT ${g.tax.niitEnabled ? "on" : "off"} · ` +
      `inflation ${(g.inflationPct * 100).toFixed(0)}%`
  );
  console.log(
    `  capital in: ${usd(g.capital.lumpSum)} up front + ${usd(g.capital.monthly)}/mo = ${usd(capital)} nominal\n`
  );

  console.log("  YEAR   interest      tax     after-tax    eff.rate");
  for (let y = 0; y < 7; y++) {
    const lo = y * 12 + 1;
    const hi = Math.min((y + 1) * 12, 83);
    let p = 0;
    let t = 0;
    for (let m = lo; m <= hi; m++) {
      p += o.preTaxCash[m];
      t += o.taxPaid[m];
    }
    console.log(
      `   ${y + 1}   ${usd(p).padStart(9)} ${usd(t).padStart(9)} ${usd(p - t).padStart(11)}` +
        `      ${p > 0 ? ((t / p) * 100).toFixed(1) + "%" : "-"}`
    );
  }

  console.log(
    `\n  TOTALS (nominal)   interest ${usd(preTax)}   tax ${usd(tax)}   after-tax ${usd(preTax - tax)}` +
      `   effective ${((tax / preTax) * 100).toFixed(1)}%`
  );

  const m = o.metrics;
  console.log(`\n  IN TODAY'S DOLLARS`);
  console.log(`    total cash collected    ${usd(m.totalCashCollected)}`);
  console.log(`    average monthly          ${usd(m.averageMonthlyCashFlow)}`);
  console.log(`    year-7 monthly           ${usd(m.yearSevenMonthlyCashFlow)}`);
  console.log(`    exit proceeds           ${usd(m.exitProceeds)}`);
  console.log(`    continuing income/mo     ${usd(m.continuingMonthlyIncome)}`);
  console.log(`    peak capital at risk    ${usd(m.peakCapitalAtRisk)}`);
  console.log(`\n  RETURN`);
  console.log(`    IRR nominal              ${pct(m.irrNominal)}`);
  console.log(`    IRR real                 ${pct(m.irrReal)}   <- after inflation`);
  console.log(`    equity multiple          ${m.equityMultiple?.toFixed(4) ?? "n/a"}`);
  const mo = (v: number | null) =>
    v === null ? "never" : `month ${v} (${(v / 12).toFixed(1)} yr)`;
  console.log(`    payback, cash only       ${mo(m.paybackMonth)}`);
  console.log(`    payback incl. sale       ${mo(m.paybackMonthIncludingSale)}`);
}

it("scenario runner", () => {
  // Miguel's actual profile: MFJ, ~$400k gross, no state income tax.
  const mine = { filingStatus: "mfj" as const, otherIncome: 400_000, stateRate: 0 };

  report("YOUR PROFILE · MFJ $400k, no state tax, 3% inflation", globals(mine));

  report(
    "same, but zero inflation — isolates the inflation drag alone",
    globals({ ...mine, inflation: 0 })
  );

  report(
    "same, at 5% inflation",
    globals({ ...mine, inflation: 0.05 })
  );
});
