import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isoToYearMonth, addMonths } from "@/lib/finance/dates";
import { monthlyPayoutOf, isActiveAt } from "@/lib/finance/projection";
import Card from "@/components/Card";
import NewAmpliconForm from "./NewAmpliconForm";
import AmpliconRow from "./AmpliconRow";

export default async function AmpliconsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: amplicons } = await supabase
    .from("amplicons")
    .select("*")
    .order("start_date", { ascending: false });

  const todayMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Amplicons</h1>

      <NewAmpliconForm />

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
                      face_value: a.face_value,
                      interest_pct: a.interest_pct,
                      term_months: a.term_months,
                      start_date: a.start_date,
                    }}
                    monthly={monthly}
                    endMonth={endMonth}
                    active={active}
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
