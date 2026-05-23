import { useState } from "react";
import type { Scenario, ScenarioOverrides } from "@engine/index";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";

interface Props {
  scenario: Scenario;
  onSave: (s: Scenario) => void;
  onCancel: () => void;
}

export default function ScenarioEditor({ scenario, onSave, onCancel }: Props) {
  const [name, setName] = useState(scenario.name);
  const [o, setO] = useState<ScenarioOverrides>(scenario.overrides);

  function patch(p: Partial<ScenarioOverrides>) {
    setO({ ...o, ...p });
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <input
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Override starting cash" hint="Leave blank to inherit">
          <NumberInput
            value={o.startingCash ?? NaN}
            onChange={(n) => patch({ startingCash: isFinite(n) && n !== 0 ? n : undefined })}
            step={1000}
          />
        </Field>
        <Field label="Override monthly savings (default)">
          <NumberInput
            value={o.monthlySavingsDefault ?? NaN}
            onChange={(n) => patch({ monthlySavingsDefault: isFinite(n) && n !== 0 ? n : undefined })}
            step={100}
          />
        </Field>
        <Field label="Override LOC APR">
          <PercentInput
            value={o.loc?.apr ?? 0}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), apr: n } })}
          />
        </Field>
        <Field label="Override LOC initial limit">
          <NumberInput
            value={o.loc?.initialLimit ?? NaN}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), initialLimit: isFinite(n) && n !== 0 ? n : undefined } })}
            step={1000}
          />
        </Field>
        <Field label="Override LOC growth rate">
          <PercentInput
            value={o.loc?.growthRatePctYr ?? 0}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), growthRatePctYr: n } })}
          />
        </Field>
        <Field label="Override flywheel threshold">
          <NumberInput
            value={o.autoFlywheelThreshold ?? NaN}
            onChange={(n) => patch({ autoFlywheelThreshold: isFinite(n) && n !== 0 ? n : undefined })}
            step={1000}
          />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ ...scenario, name, overrides: o })} className="bg-ink text-white text-sm px-4 py-1.5 rounded">
          Save
        </button>
        <button onClick={onCancel} className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
