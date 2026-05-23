import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import type { Scenario } from "@engine/index";
import Card from "@/ui/common/Card";
import ScenarioEditor from "./ScenarioEditor";

export default function ScenariosPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);
  const [editingId, setEditingId] = useState<string | null>(null);

  function add() {
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: "New scenario",
      overrides: {},
    };
    update((p) => { p.scenarios.push(s); });
    setEditingId(s.id);
  }

  function remove(id: string) {
    update((p) => {
      p.scenarios = p.scenarios.filter((s) => s.id !== id);
      if (p.activeScenarioId === id) p.activeScenarioId = null;
      if (p.baselineScenarioId === id) p.baselineScenarioId = null;
    });
  }

  function save(s: Scenario) {
    update((p) => {
      const i = p.scenarios.findIndex((x) => x.id === s.id);
      if (i >= 0) p.scenarios[i] = s;
    });
    setEditingId(null);
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Scenarios</h1>
        <button onClick={add} className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1">
          <Plus className="w-4 h-4" /> New scenario
        </button>
      </div>

      {portfolio.scenarios.length === 0 && (
        <Card>
          <p className="text-sm text-sub">No scenarios yet. Create one to compare a parameter variation against your base portfolio.</p>
        </Card>
      )}

      {portfolio.scenarios.map((s) => (
        <Card key={s.id} title={s.name}>
          {editingId === s.id ? (
            <ScenarioEditor scenario={s} onSave={save} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => update((p) => { p.activeScenarioId = p.activeScenarioId === s.id ? null : s.id; })}
                className={`px-2 py-1 rounded ${portfolio.activeScenarioId === s.id ? "bg-blue-100 text-blue-800" : "bg-zinc-100"}`}
              >
                {portfolio.activeScenarioId === s.id ? "Active ✓" : "Set as active"}
              </button>
              <button
                onClick={() => update((p) => { p.baselineScenarioId = p.baselineScenarioId === s.id ? null : s.id; })}
                className={`px-2 py-1 rounded ${portfolio.baselineScenarioId === s.id ? "bg-zinc-300" : "bg-zinc-100"}`}
              >
                {portfolio.baselineScenarioId === s.id ? "Baseline ✓" : "Set as baseline"}
              </button>
              <button onClick={() => setEditingId(s.id)} className="text-sm px-2 py-1 hover:bg-zinc-100 rounded">Edit</button>
              <button onClick={() => remove(s.id)} className="text-zinc-500 hover:text-red-600 ml-auto"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
