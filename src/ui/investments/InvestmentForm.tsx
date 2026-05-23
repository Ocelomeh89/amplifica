import { useState } from "react";
import type { Investment, FundingSource } from "@engine/index";
import { useStore } from "@/store";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";

export default function InvestmentForm({ onClose }: { onClose: () => void }) {
  const update = useStore((s) => s.update);
  const startMonth = useStore((s) => s.portfolio.startMonth);

  const [name, setName] = useState("");
  const [startMonthLocal, setStartMonthLocal] = useState(startMonth);
  const [principal, setPrincipal] = useState(25000);
  const [aprPct, setAprPct] = useState(0.08);
  const [termMonths, setTermMonths] = useState(36);
  const [fundingSource, setFundingSource] = useState<FundingSource>("loc");

  function add() {
    const id = crypto.randomUUID();
    const inv: Investment = {
      id,
      name: name || `Investment ${new Date().toLocaleDateString()}`,
      type: "amortized_note",
      startMonth: startMonthLocal,
      principal,
      fundingSource,
      params: { aprPct, termMonths },
    };
    update((p) => {
      p.investments.push(inv);
    });
    onClose();
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <input
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Real estate note A"
        />
      </Field>
      <Field label="Start month" hint="Backdating is allowed — set this in the past to roll an existing investment forward.">
        <MonthInput value={startMonthLocal} onChange={setStartMonthLocal} />
      </Field>
      <Field label="Principal ($)">
        <NumberInput value={principal} onChange={setPrincipal} min={0} step={1000} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="APR">
          <PercentInput value={aprPct} onChange={setAprPct} />
        </Field>
        <Field label="Term (months)">
          <NumberInput value={termMonths} onChange={setTermMonths} min={1} step={1} />
        </Field>
      </div>
      <Field label="Funding source">
        <select
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={fundingSource}
          onChange={(e) => setFundingSource(e.target.value as FundingSource)}
        >
          <option value="loc">Line of credit</option>
          <option value="cash">Cash</option>
          <option value="policy">Policy loan</option>
        </select>
      </Field>
      <div className="flex gap-2 mt-4">
        <button onClick={add} className="bg-ink text-white text-sm px-4 py-1.5 rounded hover:bg-zinc-700">
          Add investment
        </button>
        <button onClick={onClose} className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
