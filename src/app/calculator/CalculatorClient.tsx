"use client";

import Link from "next/link";
import Card from "@/components/Card";
import { useSimulation } from "@/components/simulator/useSimulation";
import { PUBLIC_DEFAULT_VALUES } from "@/components/simulator/sim-values";
import SimInputsGrid from "@/components/simulator/SimInputsGrid";
import SimResults from "@/components/simulator/SimResults";
import FlywheelExplainer from "@/components/simulator/FlywheelExplainer";

export default function CalculatorClient() {
  const sim = useSimulation(PUBLIC_DEFAULT_VALUES);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Flywheel calculator</h1>
        <FlywheelExplainer />
      </div>

      <Card title="Inputs">
        <SimInputsGrid values={sim.values} set={sim.set} initialInvestmentSize={sim.initialInvestmentSize} advanced="hidden" />
      </Card>

      <SimResults sim={sim} />

      <div className="bg-card border border-edge rounded-lg p-4 mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-sub">
          Like what you see? Create a free account to save this projection and track
          your real Amplicons and lines of credit.
        </p>
        <Link
          href="/signup"
          className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded whitespace-nowrap"
        >
          Create an account
        </Link>
      </div>
    </>
  );
}
