"use client";

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { fmtCurrency } from "@/lib/format";
import { useSimulation } from "@/components/simulator/useSimulation";
import { PUBLIC_DEFAULT_VALUES } from "@/components/simulator/sim-values";
import SimInputsGrid from "@/components/simulator/SimInputsGrid";
import SimResults from "@/components/simulator/SimResults";
import FlywheelExplainer from "@/components/simulator/FlywheelExplainer";

const DEFAULT_ANNUAL_INCOME = 100_000;

export default function CalculatorClient() {
  const sim = useSimulation(PUBLIC_DEFAULT_VALUES);
  const [annualIncome, setAnnualIncome] = useState(DEFAULT_ANNUAL_INCOME);

  // First month where the flywheel deploys a single investment larger than a
  // year's income — the "this is now a serious machine" milestone.
  const incomeCrossMonth =
    annualIncome > 0
      ? sim.result.series.find((p) => p.currentInvestmentSize > annualIncome)?.monthIndex ?? null
      : null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Flywheel calculator</h1>
        <FlywheelExplainer />
      </div>

      <Card title="Inputs">
        <SimInputsGrid values={sim.values} set={sim.set} initialInvestmentSize={sim.initialInvestmentSize} advanced="hidden" />

        <div className="mt-3 pt-3 border-t border-edge grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
          <Field label="Your annual income ($)" hint="marks when a single deployment tops a year's income">
            <input
              type="number"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(Number(e.target.value))}
              min={0}
              step={5000}
              className="w-full border border-edge rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <p className="text-xs text-sub sm:col-span-1 lg:col-span-2 pb-1">
            {incomeCrossMonth != null ? (
              <>
                From <span className="font-semibold text-amber-600">month {incomeCrossMonth} (~{(incomeCrossMonth / 12).toFixed(1)} yr)</span>,
                each new investment you deploy exceeds your annual income of {fmtCurrency(annualIncome)} — shown as the amber line on the charts.
              </>
            ) : annualIncome > 0 ? (
              <>Within 30 years, no single deployment exceeds your annual income of {fmtCurrency(annualIncome)} at these inputs.</>
            ) : (
              <>Enter your annual income to see when a single deployment starts to exceed it.</>
            )}
          </p>
        </div>
      </Card>

      <SimResults sim={sim} incomeMarkerMonth={incomeCrossMonth} />

      <div className="bg-card border border-edge rounded-lg p-4 mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-sub">
          Like what you see? Create a free account to save this projection and track
          your real Amplicons and lines of credit.
        </p>
        <Link
          href="/signup"
          className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded whitespace-nowrap"
        >
          Create an account
        </Link>
      </div>
    </>
  );
}
