import { requireUser } from "@/shared/supabase/auth";
import { investmentsOn } from "@/shared/view-mode";
import { isoToYearMonth, addMonths } from "@/shared/finance/dates";
import { monthlyPayoutOf, isActiveAt } from "@/shared/finance/projection";
import Card from "@/shared/ui/Card";
import NewAmpliconForm from "@/features/amplicons/ui/NewAmpliconForm";
import AmpliconRow from "@/features/amplicons/ui/AmpliconRow";
import { groupSplits } from "@/shared/splits";

export default async function AmpliconsPage() {
  const { supabase, user } = await requireUser();
  // Splits are part of investment options, gated to INVESTMENTS_USER_IDS.
  const splits = investmentsOn(user.id);

  const [{ data: amplicons }, { data: optionRows }, { data: splitRows }, { data: allocRows }] = await Promise.all([
    supabase.from("amplicons").select("*").order("start_date", { ascending: false }),
    // Missing tables (migration 0019 not applied) read as empty: no split UI rows.
    supabase.from("investment_options").select("id, name").order("name"),
    supabase.from("amplicon_splits").select("id, seq, amplicon_id, created_at"),
    supabase.from("amplicon_allocations").select("split_id, investment_option_id, pct"),
  ]);
  const options = splits ? optionRows ?? [] : [];
  const history = groupSplits(splitRows ?? [], allocRows ?? []);
  const versionsOf = (id: string) => (splits ? history.get(id) ?? [] : []);

  const todayMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Amplicons</h1>

      <NewAmpliconForm options={options} splits={splits} />

      <Card>
        {!amplicons || amplicons.length === 0 ? (
          <p className="text-sm text-sub">No Amplicons yet. Click &quot;Add Amplicon&quot; to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                <th className="py-2">Name</th>
                <th>Type</th>
                <th>Face value</th>
                <th>Rate</th>
                <th>Term</th>
                <th>Start</th>
                <th>End</th>
                <th>Monthly</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {amplicons.map((a) => {
                const startMonth = isoToYearMonth(a.start_date);
                const endMonth = addMonths(startMonth, a.term_months);
                const lite = {
                  id: a.id,
                  faceValue: a.face_value,
                  interestPct: a.interest_pct,
                  termMonths: a.term_months,
                  startMonth,
                  incomeType: a.income_type,
                  bonus: a.is_bonus ?? false,
                };
                const monthly = monthlyPayoutOf(lite);
                const active = isActiveAt(lite, todayMonth);
                return (
                  <AmpliconRow
                    key={a.id}
                    amplicon={{
                      id: a.id,
                      name: a.name,
                      ai_type: a.ai_type,
                      income_type: a.income_type,
                      is_bonus: a.is_bonus ?? false,
                      face_value: a.face_value,
                      interest_pct: a.interest_pct,
                      term_months: a.term_months,
                      start_date: a.start_date,
                    }}
                    monthly={monthly}
                    endMonth={endMonth}
                    active={active}
                    options={options}
                    versions={versionsOf(a.id)}
                    splits={splits}
                  />
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
