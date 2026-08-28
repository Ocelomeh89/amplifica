"use client";

import { useState } from "react";
import Card from "@/components/Card";
import Field from "@/components/Field";
import InfoBox from "@/components/InfoBox";
import { fmtCurrency } from "@/lib/format";
import { useSimulation } from "@/components/simulator/useSimulation";
import { PUBLIC_DEFAULT_VALUES } from "@/components/simulator/sim-values";
import SimInputsGrid, { OPTIONALITY_INFO } from "@/components/simulator/SimInputsGrid";
import SimResults from "@/components/simulator/SimResults";
import FlywheelExplainer from "@/components/simulator/FlywheelExplainer";

const DEFAULT_ANNUAL_INCOME = 80_000;
const JOIN_URL = "https://community.amplificawealth.com/home-page";

const CASHFLOW_EXCEEDS_INCOME_INFO =
  "This marks when projected monthly cash flow exceeds your current gross monthly income. It is not the same as reaching your optionality threshold or financial independence.";

export default function CalculatorClient() {
  const sim = useSimulation(PUBLIC_DEFAULT_VALUES);
  const [annualIncome, setAnnualIncome] = useState(DEFAULT_ANNUAL_INCOME);

  // First month where the system's own yearly cash flow (Amplicon payouts,
  // which distributionCashFlow already reports net of the MSC) exceeds the
  // visitor's annual income.
  const incomeCrossMonth =
    annualIncome > 0
      ? sim.result.series.find((p) => p.distributionCashFlow * 12 > annualIncome)?.monthIndex ?? null
      : null;

  const fiMonth = sim.fi.month;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {/* The page's h1 lives in page.tsx (server-rendered, crawlable). */}
        <h2 className="text-xl font-semibold">Flywheel calculator</h2>
        <FlywheelExplainer />
      </div>

      <Card title="Inputs">
        <SimInputsGrid
          values={sim.values}
          set={sim.set}
          initialInvestmentSize={sim.initialInvestmentSize}
          variant="public"
          mainExtra={
            <Field label="Annual income ($)" hint="Your current gross annual income.">
              <input
                type="number"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(Number(e.target.value))}
                min={0}
                step={5000}
                className="w-full border border-edge rounded px-2 py-1.5 text-sm"
              />
            </Field>
          }
        />
      </Card>

      <Card title="Financial optionality">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">
              Optionality threshold
              <InfoBox message={OPTIONALITY_INFO} />
            </div>
            {fiMonth != null ? (
              <>
                <div className="text-lg font-bold text-aqua">
                  month {fiMonth} (~{(fiMonth / 12).toFixed(1)} yr)
                </div>
                <div className="text-xs text-sub mt-0.5">
                  stop saving and draw {fmtCurrency(sim.values.withdrawalAmount)}/mo, sustained
                </div>
              </>
            ) : (
              <div className="text-xs text-sub mt-1">
                Drawing {fmtCurrency(sim.values.withdrawalAmount)}/mo is not sustainable
                within 30 years at these inputs.
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">
              Cash flow exceeds income
              <InfoBox message={CASHFLOW_EXCEEDS_INCOME_INFO} />
            </div>
            {incomeCrossMonth != null ? (
              <>
                <div className="text-lg font-bold text-amber-600">
                  month {incomeCrossMonth} (~{(incomeCrossMonth / 12).toFixed(1)} yr)
                </div>
                <div className="text-xs text-sub mt-0.5">
                  monthly cash flow tops your gross income of{" "}
                  {fmtCurrency(annualIncome / 12)}/mo
                </div>
              </>
            ) : (
              <div className="text-xs text-sub mt-1">
                {annualIncome > 0
                  ? "Within 30 years, monthly cash flow does not exceed your income at these inputs."
                  : "Enter your annual income to see when monthly cash flow exceeds it."}
              </div>
            )}
          </div>
        </div>
      </Card>

      <SimResults sim={sim} incomeMarkerMonth={incomeCrossMonth} variant="public" />

      <div className="bg-card border border-edge rounded-lg p-4 mt-2 text-sm text-sub">
        Like what you see?{" "}
        <a href={JOIN_URL} className="text-purple font-medium hover:underline">
          Join now
        </a>{" "}
        at {JOIN_URL.replace("https://", "")}.
      </div>
    </>
  );
}
