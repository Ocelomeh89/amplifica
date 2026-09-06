"use client";

import NumberField from "./NumberField";
import { fromPct, toPct } from "@/lib/compare/present";
import type { OptionSpec } from "@/lib/compare/run";
import type { Scenario } from "@/lib/compare/types";

const GRID = "grid grid-cols-1 sm:grid-cols-2 gap-x-4";

// A rate that differs by scenario, shown as three fields.
function ScenarioRates({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<Scenario, number>;
  onChange: (v: Record<Scenario, number>) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <p className="text-[11px] text-sub uppercase tracking-wide mb-1">{label}</p>
      <div className="grid grid-cols-3 gap-x-3">
        {(["bear", "base", "bull"] as Scenario[]).map((s) => (
          <NumberField
            key={s}
            label={s}
            value={toPct(value[s])}
            onChange={(n) => onChange({ ...value, [s]: fromPct(n) })}
            suffix="%"
          />
        ))}
      </div>
    </div>
  );
}

export default function OptionInputs({
  spec,
  onChange,
}: {
  spec: OptionSpec;
  onChange: (s: OptionSpec) => void;
}) {
  // The switch mirrors buildSeries in run.ts, so a seventh option kind is a
  // compile error here rather than a card that silently renders nothing.
  switch (spec.kind) {
    case "cash":
      return (
        <div className={GRID}>
          <ScenarioRates
            label="Yield"
            value={spec.yieldPct}
            onChange={(yieldPct) => onChange({ ...spec, yieldPct })}
          />
        </div>
      );

    case "index":
      return (
        <div className={GRID}>
          <ScenarioRates
            label="Total return"
            value={spec.returnPct}
            onChange={(returnPct) => onChange({ ...spec, returnPct })}
          />
        </div>
      );

    case "dividend":
      return (
        <div className={GRID}>
          <NumberField
            label="Dividend yield"
            value={toPct(spec.dividendYieldPct)}
            onChange={(n) => onChange({ ...spec, dividendYieldPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Qualified share"
            value={toPct(spec.qualifiedPct ?? 1)}
            onChange={(n) => onChange({ ...spec, qualifiedPct: fromPct(n) })}
            suffix="%"
            info="REITs and covered-call funds distribute largely non-qualified income."
          />
          <ScenarioRates
            label="Price growth"
            value={spec.priceGrowthPct}
            onChange={(priceGrowthPct) => onChange({ ...spec, priceGrowthPct })}
          />
        </div>
      );

    case "debt":
      return (
        <div className={GRID}>
          <NumberField
            label="Balance"
            value={spec.balance}
            onChange={(n) => onChange({ ...spec, balance: n })}
            min={0}
          />
          <NumberField
            label="Interest rate"
            value={toPct(spec.ratePct)}
            onChange={(n) => onChange({ ...spec, ratePct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Remaining term"
            value={spec.termMonths}
            onChange={(n) => onChange({ ...spec, termMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={spec.deductible}
              onChange={(e) => onChange({ ...spec, deductible: e.target.checked })}
            />
            Interest was deductible
          </label>
        </div>
      );

    case "flywheel":
      return (
        <div className={GRID}>
          <NumberField
            label="Investment size factor"
            value={spec.investmentSizeFactor}
            onChange={(n) => onChange({ ...spec, investmentSizeFactor: n })}
            min={0}
          />
          <NumberField
            label="Term"
            value={spec.termMonths}
            onChange={(n) => onChange({ ...spec, termMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <NumberField
            label="Amplicon rate"
            value={toPct(spec.investmentInterestPct)}
            onChange={(n) => onChange({ ...spec, investmentInterestPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="LoC rate"
            value={toPct(spec.locInterestPct)}
            onChange={(n) => onChange({ ...spec, locInterestPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="LoC increase"
            value={spec.locIncrease}
            onChange={(n) => onChange({ ...spec, locIncrease: n })}
            min={0}
          />
          <NumberField
            label="Exit discount rate"
            value={toPct(spec.exitDiscountPct)}
            onChange={(n) => onChange({ ...spec, exitDiscountPct: fromPct(n) })}
            suffix="%"
            info="Remaining payments are discounted at this rate. At the Amplicon rate the sale is at basis and the gain is zero."
          />
        </div>
      );

    case "rental":
      return (
        <div className={GRID}>
          <NumberField
            label="Purchase price"
            value={spec.purchasePrice}
            onChange={(n) => onChange({ ...spec, purchasePrice: n })}
            min={0}
          />
          <NumberField
            label="Down payment"
            value={toPct(spec.downPct)}
            onChange={(n) => onChange({ ...spec, downPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Closing costs"
            value={toPct(spec.closingCostPct)}
            onChange={(n) => onChange({ ...spec, closingCostPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Mortgage rate"
            value={toPct(spec.mortgageRatePct)}
            onChange={(n) => onChange({ ...spec, mortgageRatePct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Mortgage term"
            value={spec.mortgageTermMonths}
            onChange={(n) => onChange({ ...spec, mortgageTermMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <NumberField
            label="Monthly rent"
            value={spec.monthlyRent}
            onChange={(n) => onChange({ ...spec, monthlyRent: n })}
            min={0}
          />
          <NumberField
            label="Rent growth"
            value={toPct(spec.rentGrowthPct)}
            onChange={(n) => onChange({ ...spec, rentGrowthPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Vacancy"
            value={toPct(spec.vacancyPct)}
            onChange={(n) => onChange({ ...spec, vacancyPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Operating expenses"
            value={toPct(spec.operatingExpensePct)}
            onChange={(n) => onChange({ ...spec, operatingExpensePct: fromPct(n) })}
            suffix="%"
            info="A share of effective (post-vacancy) rent, stated at month 1."
          />
          <NumberField
            label="Land share"
            value={toPct(spec.landPct)}
            onChange={(n) => onChange({ ...spec, landPct: fromPct(n) })}
            suffix="%"
            info="Land is not depreciable, so this share is carved out of the basis."
          />
          <NumberField
            label="Selling costs"
            value={toPct(spec.sellingCostPct)}
            onChange={(n) => onChange({ ...spec, sellingCostPct: fromPct(n) })}
            suffix="%"
          />
          <ScenarioRates
            label="Appreciation"
            value={spec.appreciationPct}
            onChange={(appreciationPct) => onChange({ ...spec, appreciationPct })}
          />
        </div>
      );
  }
}
