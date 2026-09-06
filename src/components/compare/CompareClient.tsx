"use client";

import { useMemo, useState } from "react";
import Card from "@/components/Card";
import GlobalPanel from "./GlobalPanel";
import OptionCard, { UnbuiltCard } from "./OptionCard";
import ComparisonTable from "./ComparisonTable";
import ModelLimits from "./ModelLimits";
import { DEFAULT_GLOBALS, DEFAULT_SPECS, UNBUILT_OPTIONS } from "@/lib/compare/defaults";
import { runComparison, type ComparisonOption, type OptionSpec } from "@/lib/compare/run";
import type { GlobalInputs } from "@/lib/compare/types";

export default function CompareClient() {
  const [globals, setGlobals] = useState<GlobalInputs>(DEFAULT_GLOBALS);
  const [specs, setSpecs] = useState<OptionSpec[]>(DEFAULT_SPECS);
  const [off, setOff] = useState<Set<string>>(new Set());

  const enabled = useMemo(() => specs.filter((s) => !off.has(s.id)), [specs, off]);

  // The engine is pure and six options across 84 months take microseconds, so
  // every keystroke can recompute without debouncing. An input the engine
  // rejects — capital that cannot fund an option's outlay — throws rather
  // than returning garbage, and that message is worth showing.
  const { options, error } = useMemo(() => {
    try {
      return { options: runComparison(globals, enabled).options, error: null as string | null };
    } catch (e) {
      return { options: [] as ComparisonOption[], error: (e as Error).message };
    }
  }, [globals, enabled]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  return (
    <div className="max-w-7xl">
      <h1 className="text-xl font-semibold mb-1">Compare investments</h1>
      <p className="text-sm text-sub mb-4">
        The same money in each, over seven years, after tax and in today&apos;s
        dollars.
      </p>

      <GlobalPanel value={globals} onChange={setGlobals} />

      {error ? (
        <Card title="These inputs do not work">
          <p className="text-sm">{error}</p>
        </Card>
      ) : (
        <Card title="Results">
          <ComparisonTable options={options} />
        </Card>
      )}

      <ModelLimits />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
        {specs.map((spec, i) => (
          <OptionCard
            key={spec.id}
            spec={spec}
            enabled={!off.has(spec.id)}
            report={byId.get(spec.id)}
            onToggle={(on) =>
              setOff((prev) => {
                const next = new Set(prev);
                if (on) next.delete(spec.id);
                else next.add(spec.id);
                return next;
              })
            }
            onChange={(updated) =>
              setSpecs((prev) => prev.map((s, j) => (j === i ? updated : s)))
            }
          />
        ))}
        {UNBUILT_OPTIONS.map((u) => (
          <UnbuiltCard key={u.label} label={u.label} why={u.why} />
        ))}
      </div>
    </div>
  );
}
