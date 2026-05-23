import type { FundingSource } from "@engine/index";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";

export default function AutoFlywheelPanel() {
  const rule = useStore((s) => s.portfolio.autoFlywheel);
  const update = useStore((s) => s.update);

  function setPriority(idx: number, src: FundingSource) {
    update((p) => {
      const arr = [...p.autoFlywheel.fundingPriority];
      arr[idx] = src;
      const seen = new Set<FundingSource>();
      p.autoFlywheel.fundingPriority = arr.filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      }) as FundingSource[];
    });
  }

  return (
    <Card title="Auto-flywheel rule">
      <Field label="Enabled">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => update((p) => { p.autoFlywheel.enabled = e.target.checked; })}
          />
          Fire a new investment when capacity is available
        </label>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Threshold ($)" hint="Fire when available capacity ≥ this">
          <NumberInput
            value={rule.thresholdAmount}
            min={0}
            step={1000}
            onChange={(n) => update((p) => { p.autoFlywheel.thresholdAmount = n; })}
          />
        </Field>
        <Field label="Use all available capacity?">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.defaultPrincipalUseAllCapacity}
              onChange={(e) => update((p) => { p.autoFlywheel.defaultPrincipalUseAllCapacity = e.target.checked; })}
            />
            Otherwise use threshold amount as principal
          </label>
        </Field>
        <Field label="Template APR">
          <PercentInput
            value={rule.template.aprPct}
            onChange={(n) => update((p) => { p.autoFlywheel.template.aprPct = n; })}
          />
        </Field>
        <Field label="Template term (months)">
          <NumberInput
            value={rule.template.termMonths}
            min={1}
            step={1}
            onChange={(n) => update((p) => { p.autoFlywheel.template.termMonths = n; })}
          />
        </Field>
      </div>
      <Field label="Funding priority">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <select
              key={i}
              className="border border-zinc-300 rounded px-2 py-1.5 text-sm"
              value={rule.fundingPriority[i] ?? "cash"}
              onChange={(e) => setPriority(i, e.target.value as FundingSource)}
            >
              <option value="cash">Cash</option>
              <option value="loc">LOC</option>
              <option value="policy">Policy</option>
            </select>
          ))}
        </div>
      </Field>
    </Card>
  );
}
