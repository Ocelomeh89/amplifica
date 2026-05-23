import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { fmtCurrency } from "@/ui/common/format";

export default function LifeInsurancePage() {
  const policy = useStore((s) => s.portfolio.policy);
  const startMonth = useStore((s) => s.portfolio.startMonth);
  const active = useStore((s) => s.active);
  const update = useStore((s) => s.update);

  function ensure() {
    update((p) => {
      if (!p.policy) {
        p.policy = {
          enabled: true,
          startMonth,
          initialCashValue: 0,
          initialLoanBalance: 0,
          premiumMonthly: 0,
          cashValueGrowthRatePctYr: 0.05,
          borrowRatePctYr: 0.06,
          maxBorrowPct: 0.9,
        };
      } else {
        p.policy.enabled = !p.policy.enabled;
      }
    });
  }

  const chartData = active.map((m) => ({
    idx: m.monthIndex,
    cashValue: m.policyCashValue,
    loan: m.policyLoanBalance,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Life Insurance</h1>

      <Card>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!policy?.enabled} onChange={ensure} />
          Enable whole-life policy (infinite-banking style)
        </label>
      </Card>

      {policy?.enabled && (
        <>
          <Card title="Policy parameters">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Policy start month">
                <MonthInput value={policy.startMonth} onChange={(s) => update((p) => { if (p.policy) p.policy.startMonth = s; })} />
              </Field>
              <Field label="Monthly premium">
                <NumberInput value={policy.premiumMonthly} min={0} step={50} onChange={(n) => update((p) => { if (p.policy) p.policy.premiumMonthly = n; })} />
              </Field>
              <Field label="Initial cash value">
                <NumberInput value={policy.initialCashValue} min={0} step={1000} onChange={(n) => update((p) => { if (p.policy) p.policy.initialCashValue = n; })} />
              </Field>
              <Field label="Initial loan balance">
                <NumberInput value={policy.initialLoanBalance} min={0} step={1000} onChange={(n) => update((p) => { if (p.policy) p.policy.initialLoanBalance = n; })} />
              </Field>
              <Field label="Cash value annual growth rate">
                <PercentInput value={policy.cashValueGrowthRatePctYr} onChange={(n) => update((p) => { if (p.policy) p.policy.cashValueGrowthRatePctYr = n; })} />
              </Field>
              <Field label="Policy loan APR">
                <PercentInput value={policy.borrowRatePctYr} onChange={(n) => update((p) => { if (p.policy) p.policy.borrowRatePctYr = n; })} />
              </Field>
              <Field label="Max borrow % of cash value">
                <PercentInput value={policy.maxBorrowPct} onChange={(n) => update((p) => { if (p.policy) p.policy.maxBorrowPct = n; })} />
              </Field>
            </div>
          </Card>

          <Card title="Projected cash value vs loan balance">
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
                  <Line type="monotone" dataKey="cashValue" stroke="#2e8a4a" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="loan" stroke="#b08020" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
