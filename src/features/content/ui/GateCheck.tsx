import { GATE_ITEMS, amplificaPillarName, gateLine } from "@/features/content/engine/brand";
import Card from "@/shared/ui/Card";

type Gate = { result: { verdict: string; reader: string | null; pillar: string | null; amplifica_pillar: string | null; failed: { item: string; reason: string }[] }; rewritten: boolean; checked_at: string };

/** The brand gate's full check of one idea, on the idea page. */
export default function GateCheck({ gate, original }: { gate: unknown; original: unknown }) {
  const g = gate as Gate | null;
  if (!g?.result) return null;
  const failed = new Map(g.result.failed.map((f) => [f.item, f.reason]));
  const oldHook = (original as { hook?: unknown } | null)?.hook;
  return (
    <Card title="Brand check">
      <p className="text-sm mb-2">
        {gateLine(g) ?? "Didn't pass"}
        {g.result.amplifica_pillar && <span className="text-sub"> · under {amplificaPillarName(g.result.amplifica_pillar)}</span>}
      </p>
      <ul className="text-sm grid gap-1">
        {GATE_ITEMS.map((i) => (
          <li key={i.item} className="flex gap-2">
            <span className={failed.has(i.item) ? "text-red-600" : "text-green-600"}>{failed.has(i.item) ? "✗" : "✓"}</span>
            <span>
              {i.label}
              {failed.has(i.item) && <span className="text-sub">: {failed.get(i.item)}</span>}
            </span>
          </li>
        ))}
      </ul>
      {g.rewritten && (
        <div className="mt-3 text-sm">
          <p className="font-medium">Rewritten by the brand gate</p>
          {typeof oldHook === "string" && <p className="text-sub">Original hook: {oldHook}</p>}
        </div>
      )}
    </Card>
  );
}
