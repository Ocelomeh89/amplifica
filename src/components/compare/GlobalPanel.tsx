"use client";

import Card from "@/components/Card";
import NumberField from "./NumberField";
import { fromPct, toPct } from "@/lib/compare/present";
import type { FilingStatus, GlobalInputs, Scenario } from "@/lib/compare/types";

const selectClass =
  "w-full border border-edge rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-[11px] text-sub uppercase tracking-wide mb-1";

export default function GlobalPanel({
  value,
  onChange,
}: {
  value: GlobalInputs;
  onChange: (g: GlobalInputs) => void;
}) {
  const set = (patch: Partial<GlobalInputs>) => onChange({ ...value, ...patch });
  const setCapital = (patch: Partial<GlobalInputs["capital"]>) =>
    onChange({ ...value, capital: { ...value.capital, ...patch } });
  const setTax = (patch: Partial<GlobalInputs["tax"]>) =>
    onChange({ ...value, tax: { ...value.tax, ...patch } });

  return (
    <Card title="The same money, the same seven years">
      <p className="text-[11px] text-sub mb-4">
        Every option below is funded from this one schedule. Whatever an option
        cannot absorb sits in cash at the idle yield rather than vanishing —
        which is what makes the dollar figures comparable at all.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
        <NumberField
          label="Lump sum at month 0"
          value={value.capital.lumpSum}
          onChange={(n) => setCapital({ lumpSum: n })}
          min={0}
        />
        <NumberField
          label="Monthly contribution"
          value={value.capital.monthly}
          onChange={(n) => setCapital({ monthly: n })}
          min={0}
        />
        <NumberField
          label="Idle yield"
          value={toPct(value.capital.idleYieldPct)}
          onChange={(n) => setCapital({ idleYieldPct: fromPct(n) })}
          suffix="%"
          info="What uncommitted capital earns while it waits."
        />
        <NumberField
          label="Inflation"
          value={toPct(value.inflationPct)}
          onChange={(n) => set({ inflationPct: fromPct(n) })}
          suffix="%"
        />

        <NumberField
          label="Other ordinary income"
          value={value.tax.otherOrdinaryIncome}
          onChange={(n) => setTax({ otherOrdinaryIncome: n })}
          min={0}
          info="Annual household income from outside these investments. A deduction is worth only what it shelters."
        />
        <NumberField
          label="State rate"
          value={toPct(value.tax.stateRatePct)}
          onChange={(n) => setTax({ stateRatePct: fromPct(n) })}
          suffix="%"
        />

        <div className="mb-3">
          <label htmlFor="cmp-filing" className={labelClass}>
            Filing status
          </label>
          <select
            id="cmp-filing"
            className={selectClass}
            value={value.tax.filingStatus}
            onChange={(e) => setTax({ filingStatus: e.target.value as FilingStatus })}
          >
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
            <option value="mfs">Married filing separately</option>
            <option value="hoh">Head of household</option>
          </select>
        </div>

        <div className="mb-3">
          <label htmlFor="cmp-scenario" className={labelClass}>
            Scenario
          </label>
          <select
            id="cmp-scenario"
            className={selectClass}
            value={value.scenario}
            onChange={(e) => set({ scenario: e.target.value as Scenario })}
          >
            <option value="bear">Bear</option>
            <option value="base">Base</option>
            <option value="bull">Bull</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.realEstateProfessional}
            onChange={(e) => setTax({ realEstateProfessional: e.target.checked })}
          />
          Real estate professional
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.activelyParticipatesRental}
            onChange={(e) => setTax({ activelyParticipatesRental: e.target.checked })}
          />
          Actively participates in rental
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.niitEnabled}
            onChange={(e) => setTax({ niitEnabled: e.target.checked })}
          />
          Apply NIIT
        </label>
      </div>
    </Card>
  );
}
