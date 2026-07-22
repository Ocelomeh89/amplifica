import Link from "next/link";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/Card";
import NewProjectionButton from "./NewProjectionButton";
import { deleteProjection } from "./actions";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";

export default async function ProjectionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projections } = await supabase
    .from("projections")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Projections</h1>

      <NewProjectionButton />

      <Card>
        {!projections || projections.length === 0 ? (
          <p className="text-sm text-sub">No projections yet. Click &quot;New projection&quot; to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                <th className="py-2">Name</th>
                <th>MSC</th>
                <th>Size factor</th>
                <th>Term</th>
                <th>Inv. rate</th>
                <th>LoC inc</th>
                <th>LoC int</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.id} className="border-b border-edge">
                  <td className="py-2">
                    <Link href={`/projections/${p.id}`} className="text-purple hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td>{fmtCurrency(p.msc)}</td>
                  <td>{p.investment_size_factor.toFixed(2)}×</td>
                  <td>{p.term_months} mo</td>
                  <td>{fmtPct(p.investment_interest_pct, 1)}</td>
                  <td>{p.loc_increase.toFixed(2)}×</td>
                  <td>{fmtPct(p.loc_interest_pct, 1)}</td>
                  <td className="text-sub text-xs">{fmtDate(p.updated_at)}</td>
                  <td>
                    <form action={deleteProjection}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-sub hover:text-red-600" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
