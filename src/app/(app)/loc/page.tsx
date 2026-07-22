import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";
import Card from "@/components/Card";
import NewLoCForm from "./NewLoCForm";
import UtilizationCell from "./UtilizationCell";
import { deleteLoC } from "./actions";

export default async function LoCPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: locs } = await supabase
    .from("locs")
    .select("*")
    .order("name");

  const totalSize = (locs ?? []).reduce((s, l) => s + l.size, 0);
  const totalUtil = (locs ?? []).reduce((s, l) => s + l.utilization, 0);
  const totalAvailable = totalSize - totalUtil;
  const aggregatePct = totalSize > 0 ? totalUtil / totalSize : 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Lines of Credit</h1>

      <NewLoCForm />

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Size</div>
            <div className="text-lg font-bold">{fmtCurrency(totalSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Utilization</div>
            <div className="text-lg font-bold">{fmtCurrency(totalUtil)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total Available</div>
            <div className="text-lg font-bold">{fmtCurrency(totalAvailable)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Aggregate Utilization</div>
            <div className="text-lg font-bold">{fmtPct(aggregatePct, 1)}</div>
          </div>
        </div>
      </Card>

      <Card>
        {!locs || locs.length === 0 ? (
          <p className="text-sm text-sub">No lines of credit yet. Click &quot;Add Line of Credit&quot; to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                <th className="py-2">Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Utilization</th>
                <th>Available</th>
                <th>Util %</th>
                <th>Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locs.map((l) => {
                const available = l.size - l.utilization;
                const pct = l.size > 0 ? l.utilization / l.size : 0;
                return (
                  <tr key={l.id} className="border-b border-edge">
                    <td className="py-2">{l.name}</td>
                    <td>{l.loc_type}</td>
                    <td>{fmtCurrency(l.size)}</td>
                    <td>
                      <UtilizationCell id={l.id} value={l.utilization} />
                    </td>
                    <td>{fmtCurrency(available)}</td>
                    <td>{fmtPct(pct, 1)}</td>
                    <td className="text-sub text-xs">
                      {l.utilization_updated_at ? fmtDate(l.utilization_updated_at) : "—"}
                    </td>
                    <td>
                      <form action={deleteLoC}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          type="submit"
                          className="text-sub hover:text-red-600"
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
          </div>
        )}
      </Card>
    </div>
  );
}
