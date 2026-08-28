"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Field from "@/components/Field";
import { fmtCurrency } from "@/lib/format";
import type { SimValues } from "./sim-values";

interface Props {
  values: SimValues;
  set: <K extends keyof SimValues>(key: K, value: SimValues[K]) => void;
  initialInvestmentSize: number;
  // "editor" (default): full grid + Advanced ribbon (perpetuals, stop MSC,
  //   monthly cash needed). All fields stay mounted for the editor's save
  //   FormData.
  // "public": only the MSC (plus mainExtra) visible; the strategy inputs sit
  //   behind a "Settings" ribbon. No perpetuals.
  variant?: "editor" | "public";
  // Extra fields rendered inside the main grid (public: the annual-income
  // input, which is page state rather than a SimValues member).
  mainExtra?: ReactNode;
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";
const gridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";

export const OPTIONALITY_INFO =
  "The Financial Optionality Threshold is the moment where the Amplification System fully sustains your life: you have the option to stop working, change jobs, or expand your lifestyle.";

// The simulator input grid. The name= attributes match the FormData contract
// of updateProjection (projections/actions.ts); they are inert on the public
// calculator, where the grid is not wrapped in a form. Collapsed ribbon
// sections are CSS-hidden, NOT unmounted — unmounting would drop fields from
// the editor's save FormData and reset them to the action's defaults.
export default function SimInputsGrid({ values, set, initialInvestmentSize, variant = "editor", mainExtra }: Props) {
  const { msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, perpetualMixPct, perpetualYieldPct, perpetualTrigger, mscEndMonth, withdrawalAmount } = values;
  const [showRibbon, setShowRibbon] = useState(false);

  const mscField = (
    <Field label="Monthly savings contribution ($)" hint={variant === "editor" ? "Default from Settings" : undefined}>
      <input name="msc" type="number" value={msc} onChange={(e) => set("msc", Number(e.target.value))} min={0} step={100} className={inputClass} />
    </Field>
  );
  const factorField = (
    <Field label="Investment size factor (× MSC)" hint="3.0 – 6.0">
      <input name="investment_size_factor" type="number" value={factor} onChange={(e) => set("factor", Number(e.target.value))} min={3} max={6} step={0.01} className={inputClass} />
    </Field>
  );
  const initialSizeField = (
    <Field label="Initial investment size">
      <input value={fmtCurrency(initialInvestmentSize)} readOnly className={`${inputClass} bg-edge text-sub`} />
    </Field>
  );
  const termField = (
    <Field label="Term (months)" hint="24 – 48">
      <input name="term_months" type="number" value={term} onChange={(e) => set("term", Number(e.target.value))} min={24} max={48} step={1} className={inputClass} />
    </Field>
  );
  const invInterestField = (
    <Field label="Investment interest (%)" hint="0 – 20%, whole points">
      <input name="investment_interest_pct" type="number" value={invInterestPct} onChange={(e) => set("invInterestPct", Number(e.target.value))} min={0} max={20} step={1} className={inputClass} />
    </Field>
  );
  const locIncreaseField = (
    <Field label="Line of credit increase" hint="1.20 – 2.00 in 0.05 steps">
      <input name="loc_increase" type="number" value={locIncrease} onChange={(e) => set("locIncrease", Number(e.target.value))} min={1.2} max={2.0} step={0.05} className={inputClass} />
    </Field>
  );
  const locInterestField = (
    <Field label="Line of credit interest (%)">
      <input name="loc_interest_pct" type="number" value={locInterestPct} onChange={(e) => set("locInterestPct", Number(e.target.value))} min={0} step={0.1} className={inputClass} />
    </Field>
  );
  const withdrawalField = (
    <Field
      label="Monthly cash needed ($/mo)"
      info={OPTIONALITY_INFO}
      hint="Your estimated monthly essential expenses or cash-flow target."
    >
      <input name="withdrawal_amount" type="number" value={withdrawalAmount} onChange={(e) => set("withdrawalAmount", Number(e.target.value))} min={0} step={100} className={inputClass} />
    </Field>
  );

  const ribbonButton = (label: string, sub: string) => (
    <button
      type="button"
      onClick={() => setShowRibbon((s) => !s)}
      aria-expanded={showRibbon}
      className="w-full flex items-center gap-1.5 mt-4 mb-3 py-1.5 px-2 rounded bg-edge/60 hover:bg-edge transition-colors text-[11px] text-sub uppercase tracking-wide"
    >
      {showRibbon ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      {label}
      <span className="normal-case tracking-normal ml-1 text-sub/70">{sub}</span>
    </button>
  );

  if (variant === "public") {
    return (
      <>
        <div className={gridClass}>
          {mscField}
          {mainExtra}
        </div>

        {ribbonButton("Settings", "investment size, term, rates & monthly cash needed")}

        <div className={showRibbon ? gridClass : "hidden"}>
          {factorField}
          {initialSizeField}
          {termField}
          {invInterestField}
          {locIncreaseField}
          {locInterestField}
          {withdrawalField}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={gridClass}>
        {mscField}
        {factorField}
        {initialSizeField}
        {termField}
        {invInterestField}
        {locIncreaseField}
        {locInterestField}
      </div>

      {/* The market comparison was removed from the Amplifier; the stored
          value still rides along so saving does not reset the column. */}
      <input type="hidden" name="market_return_pct" value={marketReturnPct} />

      {ribbonButton("Advanced", "perpetuals, stop MSC & monthly cash needed")}

      <div className={showRibbon ? gridClass : "hidden"}>
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
        {withdrawalField}
      </div>
    </>
  );
}
