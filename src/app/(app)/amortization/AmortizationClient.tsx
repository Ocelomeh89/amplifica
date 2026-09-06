"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { fmtUSD0 } from "@/lib/format";
import { computeLoan, type Granularity } from "./schedule";

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";

// Inputs are held as strings so the boxes can be cleared while typing; the
// blank string reads back as 0 and the results fall to the empty state.
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-sub uppercase tracking-wide">{label}</div>
      <div className={clsx("font-bold", big ? "text-2xl text-purple" : "text-lg")}>{value}</div>
    </div>
  );
}

export default function AmortizationClient() {
  const [amount, setAmount] = useState("500000");
  const [years, setYears] = useState("30");
  const [months, setMonths] = useState("0");
  const [ratePct, setRatePct] = useState("6.5");
  const [granularity, setGranularity] = useState<Granularity>("monthly");

  const result = useMemo(
    () =>
      computeLoan({
        amount: num(amount),
        years: num(years),
        months: num(months),
        ratePct: num(ratePct),
      }),
    [amount, years, months, ratePct]
  );

  const rows = result ? (granularity === "monthly" ? result.monthly : result.yearly) : [];
  const periodLabel = granularity === "monthly" ? "Month" : "Year";

  return (
    <>
      <Card title="Inputs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Amount ($)">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
              step={1000}
              className={inputClass}
            />
          </Field>
          <Field label="Term — years">
            <input
              type="number"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              min={0}
              step={1}
              className={inputClass}
            />
          </Field>
          <Field label="Term — months">
            <input
              type="number"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              min={0}
              step={1}
              className={inputClass}
            />
          </Field>
          <Field label="Interest rate (%)" hint="Annual, nominal">
            <input
              type="number"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              min={0}
              step={0.05}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {!result ? (
        <Card>
          <p className="text-sm text-sub">
            Enter a loan amount and a term to see the payment and schedule.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Monthly payment" value={fmtUSD0(result.monthlyPayment)} big />
              <Stat label="Total interest" value={fmtUSD0(result.totalInterest)} />
              <Stat label="Total paid" value={fmtUSD0(result.totalPaid)} />
              <Stat label="Term" value={`${result.termMonths} mo`} />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Amortization schedule</h2>
              <div className="flex rounded border border-edge overflow-hidden text-xs">
                {(["monthly", "yearly"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    aria-pressed={granularity === g}
                    className={clsx(
                      "px-3 py-1.5 capitalize transition-colors",
                      granularity === g ? "bg-purple text-white" : "text-sub hover:bg-edge"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                    <th className="py-2">{periodLabel}</th>
                    <th className="py-2 text-right">Interest</th>
                    <th className="py-2 text-right">Principal</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.period} className="border-b border-edge last:border-0">
                      <td className="py-1.5">{r.period}</td>
                      <td className="py-1.5 text-right">{fmtUSD0(r.interest)}</td>
                      <td className="py-1.5 text-right">{fmtUSD0(r.principal)}</td>
                      <td className="py-1.5 text-right">{fmtUSD0(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
