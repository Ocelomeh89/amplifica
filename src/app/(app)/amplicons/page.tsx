import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isoToYearMonth, addMonths } from "@/lib/finance/dates";
import { monthlyPayoutOf, isActiveAt } from "@/lib/finance/projection";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";
import Card from "@/components/Card";
import NewAmpliconForm from "./NewAmpliconForm";
import { deleteAmplicon } from "./actions";

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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-zinc-200">
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
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">{a.name}</td>
                    <td>{a.ai_type || "—"}</td>
                    <td>{fmtCurrency(a.face_value)}</td>
                    <td>{fmtPct(a.interest_pct, 2)}</td>
                    <td>{a.term_months} mo</td>
                    <td>{fmtDate(a.start_date)}</td>
                    <td>{endMonth}</td>
                    <td>{fmtCurrency(monthly)}</td>
                    <td className={active ? "text-emerald-700" : "text-sub"}>
                      {active ? "Active" : "Inactive"}
                    </td>
                    <td>
                      <form action={deleteAmplicon}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className="text-zinc-500 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
