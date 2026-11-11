import { requireUser } from "@/shared/supabase/auth";
import { currentYearMonth } from "@/shared/finance/dates";
import { DEFAULT_GROWTH, DEFAULT_GROWTH_ID, runFundCheck, termsAt } from "@/shared/finance/fund-check";
import Card from "@/shared/ui/Card";
import { loadFundCheckInput } from "@/features/investments/data/load";
import NewOptionButton from "@/features/investments/ui/NewOptionButton";
import OptionRow, { type OptionRowData } from "@/features/investments/ui/OptionRow";
import MovesCard from "@/features/investments/ui/MovesCard";

export default async function InvestmentOptionsPage() {
  const { supabase } = await requireUser();
  const today = currentYearMonth();
  const data = await loadFundCheckInput(supabase, today);
  const result = runFundCheck(data);

  const all = [...data.options, DEFAULT_GROWTH];
  const nameOf = (id: string) => all.find((o) => o.id === id)?.name ?? "Unknown";
  const rows: OptionRowData[] = all.map((o) => ({
    id: o.id,
    name: o.name,
    terms: termsAt(o, today),
    value: result.holdingsToday[o.id] ?? 0,
    lastCheckin: data.lastCheckin[o.id] ?? null,
    usage: data.optionUsage[o.id] ?? 0,
    builtIn: o.id === DEFAULT_GROWTH_ID,
  }));

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">Investment options</h1>
      <p className="text-sm text-sub mb-4">
        Where your Amplicons&apos; money actually sits. The dashboard checks that these can cover every Amplicon
        payment. Values are worked out from what you put in, unless you update them.
      </p>

      <NewOptionButton />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                <th className="py-2">Name</th>
                <th>Type</th>
                <th>Term</th>
                <th>Rate</th>
                <th>Liquid</th>
                <th>Value today</th>
                <th>Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <OptionRow key={o.id} o={o} today={today} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MovesCard
        today={today}
        sources={all.filter((o) => termsAt(o, today).liquid).map((o) => ({ id: o.id, name: o.name }))}
        targets={all.map((o) => ({ id: o.id, name: o.name }))}
        moves={data.moves.map((m) => ({
          id: m.id,
          month: m.month,
          fromName: nameOf(m.fromId),
          toName: nameOf(m.toId),
          amount: m.amount,
          capped: result.cappedMoveIds.includes(m.id),
        }))}
      />
    </div>
  );
}
