"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Projection } from "@/lib/supabase/database.types";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { updateProjection, deleteProjection } from "../actions";
import { runSimulation } from "@/lib/finance/projection-sim";
import type { SweepBase } from "@/lib/finance/projection-sweep";
import { earliestSustainableWithdrawal } from "@/lib/finance/projection-fi";
import { fmtCurrency } from "@/lib/format";
import SimCharts from "./SimCharts";
import SweepHeatmap from "./SweepHeatmap";
import FlywheelExplainer from "./FlywheelExplainer";

// This branch models 30 years so perpetuals (30yr) and the drawdown have runway;
// headline readouts are at 5/10/15 years.
const MODEL_MONTHS = 360;
const SNAPSHOTS = [60, 120, 180]; // 5 / 10 / 15 years

interface Props {
  projection: Projection;
  justSaved: boolean;
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export default function EditorForm({ projection, justSaved }: Props) {
  const [name, setName] = useState(projection.name);
  const [msc, setMsc] = useState(projection.msc);
  const [factor, setFactor] = useState(projection.investment_size_factor);
  const [term, setTerm] = useState(projection.term_months);
  const [invInterestPct, setInvInterestPct] = useState(projection.investment_interest_pct * 100);
  const [locIncrease, setLocIncrease] = useState(projection.loc_increase);
  const [locInterestPct, setLocInterestPct] = useState(projection.loc_interest_pct * 100);
  const [marketReturnPct, setMarketReturnPct] = useState(projection.market_return_pct * 100);
  // Continuous-LoC model: step the size up on EVERY payoff, not just fast ones.
  // Experimental, client-only (not persisted) — defaults ON for this branch.
  const [continuous, setContinuous] = useState(true);
  // Perpetual-investment knobs + drawdown (all experimental / not persisted).
  const [perpetualMixPct, setPerpetualMixPct] = useState(50);
  const [perpetualTrigger, setPerpetualTrigger] = useState(50000);
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(4500);
  const [stockAllocPct, setStockAllocPct] = useState(0);

  const [debounced, setDebounced] = useState({ msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, continuous, perpetualMixPct, perpetualTrigger, monthlyWithdrawal, stockAllocPct });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, continuous, perpetualMixPct, perpetualTrigger, monthlyWithdrawal, stockAllocPct });
    }, 200);
    return () => clearTimeout(t);
  }, [msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, continuous, perpetualMixPct, perpetualTrigger, monthlyWithdrawal, stockAllocPct]);

  // Everything the sim needs except the swept axes (term, factor). The heatmap
  // and FI solver reuse this so they match the live editor exactly.
  const sweepBase: SweepBase = useMemo(
    () => ({
      msc: debounced.msc,
      investmentInterestPct: debounced.invInterestPct / 100,
      locIncrease: debounced.locIncrease,
      locInterestPct: debounced.locInterestPct / 100,
      marketReturnPct: debounced.marketReturnPct / 100,
      payoffUpgradeMonths: debounced.continuous ? Infinity : undefined,
      perpetualMix: debounced.perpetualMixPct / 100,
      perpetualTriggerSize: debounced.perpetualTrigger,
      monthlyWithdrawal: debounced.monthlyWithdrawal,
      stockAllocPct: debounced.stockAllocPct / 100,
      totalMonths: MODEL_MONTHS,
    }),
    [debounced]
  );

  const result = useMemo(
    () =>
      runSimulation({
        ...sweepBase,
        investmentSizeFactor: debounced.factor,
        termMonths: debounced.term,
      }),
    [sweepBase, debounced.factor, debounced.term]
  );

  // Earliest month you can cut MSC and draw the withdrawal while net worth grows.
  const fi = useMemo(
    () =>
      earliestSustainableWithdrawal(
        { ...sweepBase, investmentSizeFactor: debounced.factor, termMonths: debounced.term },
        debounced.monthlyWithdrawal
      ),
    [sweepBase, debounced.factor, debounced.term, debounced.monthlyWithdrawal]
  );

  const atMonth = (m: number) => result.series[Math.min(m, result.series.length - 1)];
  const initialInvestmentSize = msc * factor;
  const finalNetWorth = result.series[result.series.length - 1]?.netWorth ?? 0;
  const vsMarket = result.finalMarketBaseline > 0 ? finalNetWorth / result.finalMarketBaseline : null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projection editor</h1>
        <FlywheelExplainer />
      </div>

      {justSaved && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
          Projection saved.
        </div>
      )}

      <form action={updateProjection}>
        <input type="hidden" name="id" value={projection.id} />

        <Card title="Inputs">
          <Field label="Name">
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Monthly savings contribution ($)" hint="Default from Settings">
              <input name="msc" type="number" value={msc} onChange={(e) => setMsc(Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
            <Field label="Investment size factor (× MSC)" hint="3.0 – 6.0">
              <input name="investment_size_factor" type="number" value={factor} onChange={(e) => setFactor(Number(e.target.value))} min={3} max={6} step={0.01} className={inputClass} />
            </Field>
            <Field label="Initial investment size">
              <input value={fmtCurrency(initialInvestmentSize)} readOnly className={`${inputClass} bg-edge text-sub`} />
            </Field>

            <Field label="Term (months)" hint="24 – 48">
              <input name="term_months" type="number" value={term} onChange={(e) => setTerm(Number(e.target.value))} min={24} max={48} step={1} className={inputClass} />
            </Field>
            <Field label="Investment interest (%)" hint="0 – 20%, whole points">
              <input name="investment_interest_pct" type="number" value={invInterestPct} onChange={(e) => setInvInterestPct(Number(e.target.value))} min={0} max={20} step={1} className={inputClass} />
            </Field>
            <Field label="Line of credit increase" hint="1.20 – 2.00 in 0.05 steps">
              <input name="loc_increase" type="number" value={locIncrease} onChange={(e) => setLocIncrease(Number(e.target.value))} min={1.2} max={2.0} step={0.05} className={inputClass} />
            </Field>

            <Field label="Line of credit interest (%)">
              <input name="loc_interest_pct" type="number" value={locInterestPct} onChange={(e) => setLocInterestPct(Number(e.target.value))} min={0} step={0.1} className={inputClass} />
            </Field>
            <Field label="Market return (%)" hint="Stock-market benchmark, e.g. 10%">
              <input name="market_return_pct" type="number" value={marketReturnPct} onChange={(e) => setMarketReturnPct(Number(e.target.value))} min={0} step={0.5} className={inputClass} />
            </Field>
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
            <span className="font-medium">Continuous LoC growth</span>
            <span className="text-sub text-xs">
              step the size up on every payoff, not just payoffs under 3 months (experimental, not saved)
            </span>
          </label>
        </Card>

        <div className="flex gap-2 mb-4">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
            Save projection
          </button>
        </div>
      </form>

      <Card title="Perpetuals, stocks & drawdown (experimental, not saved)">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Stock allocation (%)" hint="share of MSC into stocks @ market return; rest feeds the flywheel">
            <input type="number" value={stockAllocPct} onChange={(e) => setStockAllocPct(Number(e.target.value))} min={0} max={100} step={5} className={inputClass} />
          </Field>
          <Field label="Perpetual mix (%)" hint="share of launches that go perpetual once size ≥ trigger">
            <input type="number" value={perpetualMixPct} onChange={(e) => setPerpetualMixPct(Number(e.target.value))} min={0} max={100} step={5} className={inputClass} />
          </Field>
          <Field label="Perpetual trigger ($)" hint="draw size at which perpetuals merge in">
            <input type="number" value={perpetualTrigger} onChange={(e) => setPerpetualTrigger(Number(e.target.value))} min={0} step={5000} className={inputClass} />
          </Field>
          <Field label="Monthly withdrawal ($)" hint="drawn once you cut MSC">
            <input type="number" value={monthlyWithdrawal} onChange={(e) => setMonthlyWithdrawal(Number(e.target.value))} min={0} step={500} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Key results @ 5 / 10 / 15 years">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">&nbsp;</div>
            {["Net worth", "Steady income/mo", "Perpetual income/mo", "Stock pot"].map((label) => (
              <div key={label} className="text-xs text-sub py-0.5">{label}</div>
            ))}
          </div>
          {SNAPSHOTS.map((m) => (
            <div key={m}>
              <div className="text-[10px] text-sub uppercase tracking-wide">{m / 12} yr</div>
              <div className="text-sm font-bold py-0.5">{fmtCurrency(atMonth(m).netWorth)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(atMonth(m).cashFlow)}</div>
              <div className="text-sm py-0.5 text-aqua">{fmtCurrency(atMonth(m).perpetualIncome)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(atMonth(m).stockBalance)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-edge text-sm">
          {fi.month != null ? (
            <>
              <span className="font-medium">Financial independence: </span>
              cut MSC and draw {fmtCurrency(monthlyWithdrawal)}/mo from{" "}
              <span className="font-bold text-aqua">month {fi.month} (~{(fi.month / 12).toFixed(1)} yr)</span>{" "}
              — net worth still climbs to {fmtCurrency(fi.netWorthAtEnd ?? 0)} by year 30.
            </>
          ) : (
            <>
              <span className="font-medium">Financial independence: </span>
              <span className="text-sub">not reachable within 30 years at {fmtCurrency(monthlyWithdrawal)}/mo with these inputs.</span>
            </>
          )}
        </div>
      </Card>

      <Card title="Summary">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Initial investment</div>
            <div className="text-base font-bold">{fmtCurrency(result.initialInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Final investment size</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Investments launched</div>
            <div className="text-base font-bold">{result.investmentsLaunched}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Peak outstanding</div>
            <div className="text-base font-bold">{fmtCurrency(result.peakOutstanding)}</div>
          </div>
        </div>
      </Card>

      <Card title="Flywheel vs market">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total contributed (MSC)</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalContributedCapital)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Net worth (flywheel)</div>
            <div className="text-base font-bold text-aqua">{fmtCurrency(finalNetWorth)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Market ({marketReturnPct}% DCA)</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalMarketBaseline)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Flywheel vs market</div>
            <div className="text-base font-bold">{vsMarket != null ? `${vsMarket.toFixed(1)}×` : "—"}</div>
          </div>
        </div>
      </Card>

      <SimCharts series={result.series} />

      <Card title="Optimize: term × factor">
        <p className="text-xs text-sub mb-3">
          Each cell runs the full simulation at that term and starting contribution factor, holding
          the other inputs fixed. The framed cell is the optimum for each objective. Net worth and
          cashflow often peak at different settings — that&apos;s the leverage tradeoff.
        </p>
        <SweepHeatmap base={sweepBase} />
      </Card>

      <form action={deleteProjection} className="mt-2">
        <input type="hidden" name="id" value={projection.id} />
        <button type="submit" className="text-sm text-sub hover:text-red-600 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete projection
        </button>
      </form>
    </>
  );
}
