"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Projection } from "@/shared/supabase/database.types";
import Card from "@/shared/ui/Card";
import Field from "@/shared/ui/Field";
import { updateProjection, deleteProjection } from "@/features/projections/data/actions";
import { useSimulation } from "@/features/simulator/useSimulation";
import { projectionToSimValues } from "@/features/simulator/sim-values";
import SimInputsGrid from "@/features/simulator/SimInputsGrid";
import SimResults from "@/features/simulator/SimResults";
import FlywheelExplainer from "@/features/simulator/FlywheelExplainer";

interface Props {
  projection: Projection;
  justSaved: boolean;
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export default function EditorForm({ projection, justSaved }: Props) {
  const [name, setName] = useState(projection.name);
  const sim = useSimulation(projectionToSimValues(projection));

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

          <SimInputsGrid values={sim.values} set={sim.set} initialInvestmentSize={sim.initialInvestmentSize} />
        </Card>

        <div className="flex gap-2 mb-4">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
            Save projection
          </button>
        </div>
      </form>

      <SimResults sim={sim} />

      <form action={deleteProjection} className="mt-2">
        <input type="hidden" name="id" value={projection.id} />
        <button type="submit" className="text-sm text-sub hover:text-red-600 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete projection
        </button>
      </form>
    </>
  );
}
