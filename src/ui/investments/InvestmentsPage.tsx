import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import { fmtCurrency } from "@/ui/common/format";
import { remainingPrincipalAfter, monthsBetween } from "@engine/index";
import Card from "@/ui/common/Card";
import InvestmentForm from "./InvestmentForm";
import AutoFlywheelPanel from "./AutoFlywheelPanel";

export default function InvestmentsPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);
  const [showForm, setShowForm] = useState(false);

  function remove(id: string) {
    update((p) => {
      p.investments = p.investments.filter((i) => i.id !== id);
    });
  }

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Investments</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Add investment
        </button>
      </div>

      {showForm && (
        <Card title="New investment">
          <InvestmentForm onClose={() => setShowForm(false)} />
        </Card>
      )}

      <Card>
        {portfolio.investments.length === 0 ? (
          <p className="text-sm text-sub">No investments yet. Click &ldquo;Add investment&rdquo; to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-zinc-200">
                <th className="py-2">Name</th>
                <th>Start</th>
                <th>Principal</th>
                <th>Rate</th>
                <th>Term</th>
                <th>Source</th>
                <th>Remaining @ today</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.investments.map((inv) => {
                const elapsed = Math.max(0, monthsBetween(inv.startMonth, portfolio.startMonth));
                const remaining = remainingPrincipalAfter(
                  inv.principal,
                  inv.params.aprPct,
                  inv.params.termMonths,
                  elapsed
                );
                return (
                  <tr key={inv.id} className="border-b border-zinc-100">
                    <td className="py-2">{inv.name}</td>
                    <td>{inv.startMonth}</td>
                    <td>{fmtCurrency(inv.principal)}</td>
                    <td>{(inv.params.aprPct * 100).toFixed(2)}%</td>
                    <td>{inv.params.termMonths}</td>
                    <td className="capitalize">{inv.fundingSource}</td>
                    <td>{fmtCurrency(remaining)}</td>
                    <td>
                      <button
                        onClick={() => remove(inv.id)}
                        className="text-zinc-500 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <AutoFlywheelPanel />
    </div>
  );
}
