import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";

export default function SettingsPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <Card title="Portfolio">
        <Field label="Name">
          <input
            className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            value={portfolio.name}
            onChange={(e) => update((p) => { p.name = e.target.value; })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start month">
            <MonthInput
              value={portfolio.startMonth}
              onChange={(s) => update((p) => { p.startMonth = s; })}
            />
          </Field>
          <Field label="Projection horizon (months)">
            <NumberInput
              value={portfolio.horizonMonths}
              min={1}
              step={1}
              onChange={(n) => update((p) => { p.horizonMonths = n; })}
            />
          </Field>
          <Field label="Starting cash">
            <NumberInput
              value={portfolio.startingCash}
              step={1000}
              onChange={(n) => update((p) => { p.startingCash = n; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Monthly savings">
        <Field label="Default amount per month">
          <NumberInput
            value={portfolio.monthlySavings.default}
            min={0}
            step={100}
            onChange={(n) => update((p) => { p.monthlySavings.default = n; })}
          />
        </Field>
        <div className="mt-3">
          <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Per-month overrides</div>
          {portfolio.monthlySavings.overrides.length === 0 && (
            <p className="text-sm text-sub italic mb-3">No overrides.</p>
          )}
          <div className="space-y-2 mb-3">
            {portfolio.monthlySavings.overrides.map((o, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="w-40">
                  <MonthInput
                    value={o.month}
                    onChange={(s) => update((p) => { p.monthlySavings.overrides[i].month = s; })}
                  />
                </div>
                <div className="flex-1">
                  <NumberInput
                    value={o.amount}
                    step={100}
                    onChange={(n) => update((p) => { p.monthlySavings.overrides[i].amount = n; })}
                  />
                </div>
                <button
                  onClick={() => update((p) => { p.monthlySavings.overrides.splice(i, 1); })}
                  className="text-zinc-500 hover:text-red-600 px-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => update((p) => { p.monthlySavings.overrides.push({ month: portfolio.startMonth, amount: 0 }); })}
            className="text-sm inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded"
          >
            <Plus className="w-4 h-4" /> Add override
          </button>
        </div>
      </Card>
    </div>
  );
}
