import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";
import type { SkimPolicy } from "@engine/index";

export default function TargetsPage() {
  const targets = useStore((s) => s.portfolio.targets);
  const skim = useStore((s) => s.portfolio.skim);
  const update = useStore((s) => s.update);

  function setSkim<K extends keyof SkimPolicy>(k: K, v: SkimPolicy[K]) {
    update((p) => { p.skim[k] = v; });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Targets &amp; Skim</h1>

      <Card title="Targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cash flow target ($/mo)" hint="Investment cash in per month">
            <NumberInput
              value={targets.cashFlow ?? 0}
              min={0}
              step={500}
              onChange={(n) => update((p) => { p.targets.cashFlow = n > 0 ? n : undefined; })}
            />
          </Field>
          <Field label="Net worth target ($)">
            <NumberInput
              value={targets.netWorth ?? 0}
              min={0}
              step={10000}
              onChange={(n) => update((p) => { p.targets.netWorth = n > 0 ? n : undefined; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Skim policy">
        <p className="text-sm text-sub mb-3">Once the trigger fires, skim a percentage of investment cash flow as personal consumption. Latches on permanently in MVP.</p>

        <Field label="Trigger mode">
          <select
            className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            value={skim.triggerMode}
            onChange={(e) => setSkim("triggerMode", e.target.value as SkimPolicy["triggerMode"])}
          >
            <option value="netWorth">Net worth threshold</option>
            <option value="cashFlow">Cash flow threshold</option>
            <option value="either">Either net worth OR cash flow</option>
            <option value="both">Both net worth AND cash flow</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Trigger net worth">
            <NumberInput
              value={skim.triggerNetWorth ?? 0}
              min={0}
              step={10000}
              onChange={(n) => setSkim("triggerNetWorth", n > 0 ? n : undefined)}
            />
          </Field>
          <Field label="Trigger monthly cash flow">
            <NumberInput
              value={skim.triggerCashFlow ?? 0}
              min={0}
              step={500}
              onChange={(n) => setSkim("triggerCashFlow", n > 0 ? n : undefined)}
            />
          </Field>
        </div>

        <Field label="Skim percentage" hint="Of investment cash flow each month, once triggered">
          <PercentInput value={skim.skimPct} onChange={(n) => setSkim("skimPct", n)} />
        </Field>
      </Card>
    </div>
  );
}
