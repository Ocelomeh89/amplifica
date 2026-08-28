"use client";

import { useEffect, useMemo, useState } from "react";
import { runSimulation } from "@/lib/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/lib/finance/projection-fi";
import { toSimInput, type SimValues } from "./sim-values";

// Client-side simulation state shared by the projection editor and the public
// calculator: the 12 input values, a 200ms debounce, and the engine outputs.
export function useSimulation(initial: SimValues) {
  const [values, setValues] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(values), 200);
    return () => clearTimeout(t);
  }, [values]);

  const set = <K extends keyof SimValues>(key: K, value: SimValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const simInput = useMemo(() => toSimInput(debounced), [debounced]);
  const result = useMemo(() => runSimulation(simInput), [simInput]);
  const fi = useMemo(
    () => earliestSustainableWithdrawal(simInput, simInput.monthlyWithdrawal, { requireGrowth: false }),
    [simInput]
  );

  const at = (m: number) => result.series[Math.min(m, result.series.length - 1)];

  // Live (undebounced) so the read-only field tracks keystrokes.
  const initialInvestmentSize = values.msc * values.factor;
  const lastMonth = result.series.length - 1;
  const finalExpectedFuturePayments = at(lastMonth)?.expectedFuturePayments ?? 0;
  const finalMonthlyCashFlow = at(lastMonth)?.distributionCashFlow ?? 0;
  const finalDeployedCapital = result.finalDeployedCapital;
  const horizonYears = Math.round(result.series.length / 12);

  return {
    values,
    set,
    result,
    fi,
    at,
    initialInvestmentSize,
    finalExpectedFuturePayments,
    finalMonthlyCashFlow,
    finalDeployedCapital,
    horizonYears,
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
