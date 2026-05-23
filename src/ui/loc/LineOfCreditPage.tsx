import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";

export default function LineOfCreditPage() {
  const loc = useStore((s) => s.portfolio.loc);
  const startMonth = useStore((s) => s.portfolio.startMonth);
  const update = useStore((s) => s.update);

  function addOverride() {
    update((p) => {
      p.loc.limitOverrides.push({ month: startMonth, newLimit: p.loc.initialLimit });
    });
  }

  function removeOverride(i: number) {
    update((p) => {
      p.loc.limitOverrides.splice(i, 1);
    });
  }

  function setOverride(i: number, field: "month" | "newLimit", value: string | number) {
    update((p) => {
      if (field === "month") p.loc.limitOverrides[i].month = String(value);
      else p.loc.limitOverrides[i].newLimit = Number(value);
    });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Line of Credit</h1>

      <Card title="Configuration">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Initial limit">
            <NumberInput
              value={loc.initialLimit}
              min={0}
              step={1000}
              onChange={(n) => update((p) => { p.loc.initialLimit = n; })}
            />
          </Field>
          <Field label="Initial outstanding balance">
            <NumberInput
              value={loc.initialBalance}
              min={0}
              step={1000}
              onChange={(n) => update((p) => { p.loc.initialBalance = n; })}
            />
          </Field>
          <Field label="APR">
            <PercentInput
              value={loc.apr}
              onChange={(n) => update((p) => { p.loc.apr = n; })}
            />
          </Field>
          <Field label="Annual limit growth rate">
            <PercentInput
              value={loc.growthRatePctYr}
              onChange={(n) => update((p) => { p.loc.growthRatePctYr = n; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Manual limit overrides">
        <p className="text-sm text-sub mb-3">Pin the LOC limit to a specific value at a specific month. Useful when you know an increase is coming.</p>
        {loc.limitOverrides.length === 0 && (
          <p className="text-sm text-sub italic">No overrides.</p>
        )}
        <div className="space-y-2 mb-3">
          {loc.limitOverrides.map((o, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="w-40"><MonthInput value={o.month} onChange={(s) => setOverride(i, "month", s)} /></div>
              <div className="flex-1"><NumberInput value={o.newLimit} min={0} step={1000} onChange={(n) => setOverride(i, "newLimit", n)} /></div>
              <button onClick={() => removeOverride(i)} className="text-zinc-500 hover:text-red-600 px-2"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={addOverride} className="text-sm inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded">
          <Plus className="w-4 h-4" /> Add override
        </button>
      </Card>
    </div>
  );
}
