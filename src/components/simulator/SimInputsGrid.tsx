"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Field from "@/components/Field";
import { fmtCurrency } from "@/lib/format";
import type { SimValues } from "./sim-values";

interface Props {
  values: SimValues;
  set: <K extends keyof SimValues>(key: K, value: SimValues[K]) => void;
  initialInvestmentSize: number;
  // "ribbon" (default): advanced fields behind a collapsible ribbon.
  // "hidden": advanced fields not rendered at all (public calculator).
  advanced?: "ribbon" | "hidden";
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";
const gridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";

// The simulator input grid. The name= attributes match the FormData contract
// of updateProjection (projections/actions.ts); they are inert on the public
// calculator, where the grid is not wrapped in a form. The collapsed advanced
// section is CSS-hidden, NOT unmounted — unmounting would drop its fields
// from the editor's save FormData and reset them to the action's defaults.
export default function SimInputsGrid({ values, set, initialInvestmentSize, advanced = "ribbon" }: Props) {
  const { msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, perpetualMixPct, perpetualYieldPct, perpetualTrigger, mscEndMonth, withdrawalAmount } = values;
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <>
      <div className={gridClass}>
        <Field label="Monthly savings contribution ($)" hint="Default from Settings">
          <input name="msc" type="number" value={msc} onChange={(e) => set("msc", Number(e.target.value))} min={0} step={100} className={inputClass} />
        </Field>
        <Field label="Investment size factor (× MSC)" hint="3.0 – 6.0">
          <input name="investment_size_factor" type="number" value={factor} onChange={(e) => set("factor", Number(e.target.value))} min={3} max={6} step={0.01} className={inputClass} />
        </Field>
        <Field label="Initial investment size">
          <input value={fmtCurrency(initialInvestmentSize)} readOnly className={`${inputClass} bg-edge text-sub`} />
        </Field>

        <Field label="Term (months)" hint="24 – 48">
          <input name="term_months" type="number" value={term} onChange={(e) => set("term", Number(e.target.value))} min={24} max={48} step={1} className={inputClass} />
        </Field>
        <Field label="Investment interest (%)" hint="0 – 20%, whole points">
          <input name="investment_interest_pct" type="number" value={invInterestPct} onChange={(e) => set("invInterestPct", Number(e.target.value))} min={0} max={20} step={1} className={inputClass} />
        </Field>
        <Field label="Line of credit increase" hint="1.20 – 2.00 in 0.05 steps">
          <input name="loc_increase" type="number" value={locIncrease} onChange={(e) => set("locIncrease", Number(e.target.value))} min={1.2} max={2.0} step={0.05} className={inputClass} />
        </Field>

        <Field label="Line of credit interest (%)">
          <input name="loc_interest_pct" type="number" value={locInterestPct} onChange={(e) => set("locInterestPct", Number(e.target.value))} min={0} step={0.1} className={inputClass} />
        </Field>
        <Field label="Market return (%)" hint="Stock-market benchmark, e.g. 10%">
          <input name="market_return_pct" type="number" value={marketReturnPct} onChange={(e) => set("marketReturnPct", Number(e.target.value))} min={0} step={0.5} className={inputClass} />
        </Field>
      </div>

      {advanced === "ribbon" && (
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            aria-expanded={showAdvanced}
            className="w-full flex items-center gap-1.5 mt-4 mb-3 py-1.5 px-2 rounded bg-edge/60 hover:bg-edge transition-colors text-[11px] text-sub uppercase tracking-wide"
          >
            {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Advanced
            <span className="normal-case tracking-normal ml-1 text-sub/70">perpetuals, stop MSC &amp; withdrawal</span>
          </button>

          <div className={showAdvanced ? gridClass : "hidden"}>
            <Field label="Perpetual yield (% COC)" hint="long-term Amplicon cash-on-cash, 30-yr">
              <input name="perpetual_yield_pct" type="number" value={perpetualYieldPct} onChange={(e) => set("perpetualYieldPct", Number(e.target.value))} min={0} step={0.5} className={inputClass} />
            </Field>
            <Field label="Perpetual mix (%)" hint="share of launches that go long-term past trigger">
              <input name="perpetual_mix" type="number" value={perpetualMixPct} onChange={(e) => set("perpetualMixPct", Number(e.target.value))} min={0} max={100} step={5} className={inputClass} />
            </Field>
            <Field label="Perpetual trigger ($)" hint="draw size at which long-term roll in">
              <input name="perpetual_trigger_size" type="number" value={perpetualTrigger} onChange={(e) => set("perpetualTrigger", Number(e.target.value))} min={0} step={5000} className={inputClass} />
            </Field>
            <Field label="Stop MSC at month" hint="blank = never">
              <input name="msc_end_month" type="number" value={mscEndMonth} onChange={(e) => set("mscEndMonth", e.target.value === "" ? "" : Number(e.target.value))} min={0} step={1} className={inputClass} />
            </Field>
            <Field label="Withdrawal at optionality ($/mo)" hint="monthly draw once you could stop saving">
              <input name="withdrawal_amount" type="number" value={withdrawalAmount} onChange={(e) => set("withdrawalAmount", Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
          </div>
        </>
      )}
    </>
  );
}
