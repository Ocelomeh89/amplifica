"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Projection } from "@/lib/supabase/database.types";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { updateProjection, deleteProjection } from "../actions";
import { runSimulation } from "@/lib/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/lib/finance/projection-fi";
import { fmtCurrency } from "@/lib/format";
import SimCharts from "./SimCharts";
import FlywheelExplainer from "./FlywheelExplainer";

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
  // Fixed-mode gate + continuous LoC growth are parked (see PRODUCT-STATUS "Possible
  // upgrades"). The engine + DB columns remain; the editor just uses the defaults.
  const [perpetualMixPct, setPerpetualMixPct] = useState(projection.perpetual_mix * 100);
  const [perpetualYieldPct, setPerpetualYieldPct] = useState(projection.perpetual_yield_pct * 100);
  const [perpetualTrigger, setPerpetualTrigger] = useState(projection.perpetual_trigger_size);
  const [mscEndMonth, setMscEndMonth] = useState<number | "">(projection.msc_end_month ?? "");
  const [withdrawalAmount, setWithdrawalAmount] = useState(projection.withdrawal_amount);

  const [debounced, setDebounced] = useState({ msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, perpetualMixPct, perpetualYieldPct, perpetualTrigger, mscEndMonth, withdrawalAmount });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, perpetualMixPct, perpetualYieldPct, perpetualTrigger, mscEndMonth, withdrawalAmount });
    }, 200);
    return () => clearTimeout(t);
  }, [msc, factor, term, invInterestPct, locIncrease, locInterestPct, marketReturnPct, perpetualMixPct, perpetualYieldPct, perpetualTrigger, mscEndMonth, withdrawalAmount]);

  const simInput = useMemo(
    () => ({
      msc: debounced.msc,
      investmentSizeFactor: debounced.factor,
      termMonths: debounced.term,
      investmentInterestPct: debounced.invInterestPct / 100,
      locIncrease: debounced.locIncrease,
      locInterestPct: debounced.locInterestPct / 100,
      marketReturnPct: debounced.marketReturnPct / 100,
      // payoffUpgradeMonths omitted → engine default (PAYOFF_UPGRADE_MONTHS). Gate
      // + continuous growth are parked; see PRODUCT-STATUS "Possible upgrades".
      perpetualMix: debounced.perpetualMixPct / 100,
      perpetualYieldPct: debounced.perpetualYieldPct / 100,
      perpetualTriggerSize: debounced.perpetualTrigger,
      mscEndMonth: debounced.mscEndMonth === "" ? undefined : Number(debounced.mscEndMonth),
      monthlyWithdrawal: debounced.withdrawalAmount,
      totalMonths: 360,
    }),
    [debounced]
  );
  const result = useMemo(() => runSimulation(simInput), [simInput]);

  const SNAPSHOTS = [60, 120, 180]; // 5 / 10 / 15 years
  const at = (m: number) => result.series[Math.min(m, result.series.length - 1)];
  const fi = useMemo(
    () => earliestSustainableWithdrawal(simInput, simInput.monthlyWithdrawal, { requireGrowth: false }),
    [simInput]
  );

  const initialInvestmentSize = msc * factor;
  const finalExpectedFuturePayments = result.series[result.series.length - 1]?.expectedFuturePayments ?? 0;
  const vsMarket = result.finalMarketBaseline > 0 ? finalExpectedFuturePayments / result.finalMarketBaseline : null;

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
            <Field label="Perpetual yield (% COC)" hint="long-term Amplicon cash-on-cash, 30-yr">
              <input name="perpetual_yield_pct" type="number" value={perpetualYieldPct} onChange={(e) => setPerpetualYieldPct(Number(e.target.value))} min={0} step={0.5} className={inputClass} />
            </Field>
            <Field label="Perpetual mix (%)" hint="share of launches that go long-term past trigger">
              <input name="perpetual_mix" type="number" value={perpetualMixPct} onChange={(e) => setPerpetualMixPct(Number(e.target.value))} min={0} max={100} step={5} className={inputClass} />
            </Field>
            <Field label="Perpetual trigger ($)" hint="draw size at which long-term roll in">
              <input name="perpetual_trigger_size" type="number" value={perpetualTrigger} onChange={(e) => setPerpetualTrigger(Number(e.target.value))} min={0} step={5000} className={inputClass} />
            </Field>
            <Field label="Stop MSC at month" hint="blank = never">
              <input name="msc_end_month" type="number" value={mscEndMonth} onChange={(e) => setMscEndMonth(e.target.value === "" ? "" : Number(e.target.value))} min={0} step={1} className={inputClass} />
            </Field>
            <Field label="Withdrawal at FI ($/mo)">
              <input name="withdrawal_amount" type="number" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2 mb-4">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
            Save projection
          </button>
        </div>
      </form>

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
            <div className="text-[10px] text-sub uppercase tracking-wide">Expected future payments</div>
            <div className="text-base font-bold text-aqua">{fmtCurrency(finalExpectedFuturePayments)}</div>
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

      <Card title="Key results @ 5 / 10 / 15 years (accumulation)">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">&nbsp;</div>
            {["Expected future payments", "Cash flow/mo", "Perpetual income/mo"].map((label) => (
              <div key={label} className="text-xs text-sub py-0.5">{label}</div>
            ))}
          </div>
          {SNAPSHOTS.map((m) => (
            <div key={m}>
              <div className="text-[10px] text-sub uppercase tracking-wide">{m / 12} yr</div>
              <div className="text-sm font-bold py-0.5">{fmtCurrency(at(m).expectedFuturePayments)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(at(m).cashFlow)}</div>
              <div className="text-sm py-0.5 text-aqua">{fmtCurrency(at(m).perpetualIncome)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-edge text-sm">
          {fi.month != null ? (
            <>
              <span className="font-medium">Financial independence: </span>
              stop saving and draw {fmtCurrency(withdrawalAmount)}/mo from{" "}
              <span className="font-bold text-aqua">month {fi.month} (~{(fi.month / 12).toFixed(1)} yr)</span>{" "}
              — the total holds, ending at {fmtCurrency(fi.expectedFuturePaymentsAtEnd ?? 0)}.
            </>
          ) : (
            <span className="text-sub">FI: drawing {fmtCurrency(withdrawalAmount)}/mo is not sustainable within 30 years at these inputs.</span>
          )}
        </div>
      </Card>

      <SimCharts series={result.series} />

      <form action={deleteProjection} className="mt-2">
        <input type="hidden" name="id" value={projection.id} />
        <button type="submit" className="text-sm text-sub hover:text-red-600 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete projection
        </button>
      </form>
    </>
  );
}
