import { Trash2 } from "lucide-react";
import { requireContentOwner } from "@/features/content/data/owner";
import { addSourceRule, deleteSourceRule } from "@/features/content/data/actions";
import ContentTabs from "@/features/content/ui/ContentTabs";
import PendingSourcesStrip from "@/features/content/ui/PendingSourcesStrip";
import { lastRunByKind } from "@/features/content/engine/runs";
import { SOURCE_KINDS } from "@/features/content/engine/types";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";

export default async function ContentSourcesPage() {
  const { supabase, user } = await requireContentOwner();

  const [{ data: rules }, { data: pending }, { data: recent }] = await Promise.all([
    supabase.from("content_source_rules").select("*").eq("user_id", user.id).order("kind").order("pattern"),
    supabase.from("content_sources").select("*").eq("user_id", user.id).eq("status", "pending").order("occurred_at", { ascending: false }),
    supabase.from("content_sources").select("id, kind, title, external_id, status, occurred_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);

  const lastRun = lastRunByKind(recent ?? []);
  const countByKind = Object.fromEntries(SOURCE_KINDS.map((k) => [k, (recent ?? []).filter((s) => s.kind === k).length]));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />

      <PendingSourcesStrip sources={pending ?? []} />

      <Card title="Who gets read">
        <p className="text-xs text-sub mb-3">
          Allow rules open a recording to the routine; deny rules keep it closed. A recording matching neither waits
          above until you decide. Client engagements belong on the deny list.
        </p>
        <form action={addSourceRule} className="flex flex-wrap items-end gap-2 mb-3">
          <select name="kind" className="border border-edge rounded px-2 py-1.5 text-sm bg-card">
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
          <select name="field" className="border border-edge rounded px-2 py-1.5 text-sm bg-card">
            <option value="title">title contains</option>
            <option value="participant">participant contains</option>
          </select>
          <input name="pattern" required placeholder="e.g. Amplifica" className="border border-edge rounded px-2 py-1.5 text-sm bg-card flex-1 min-w-40" />
          <button type="submit" className="bg-purple hover:bg-purple/90 text-white text-sm px-3 py-1.5 rounded">Add rule</button>
        </form>
        {(rules ?? []).length === 0 ? (
          <p className="text-sm text-sub">No rules yet. Until there are, every recording waits for a decision.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id} className="border-b border-edge">
                  <td className={r.kind === "allow" ? "text-teal-700 py-1" : "text-red-600 py-1"}>{r.kind}</td>
                  <td className="text-sub">{r.field} contains</td>
                  <td className="font-mono">{r.pattern}</td>
                  <td className="text-right">
                    <form action={deleteSourceRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" aria-label="Delete rule" className="text-sub hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Mined log">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
              <th className="py-2">Source</th><th>Rows (last 200)</th><th>Last written (last 200)</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_KINDS.map((k) => (
              <tr key={k} className="border-b border-edge">
                <td className="py-1">{k}</td>
                <td>{countByKind[k]}</td>
                <td className="text-sub">{lastRun[k] ? fmtDate(lastRun[k]) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Recent">
        <ul className="text-sm space-y-1">
          {(recent ?? []).slice(0, 40).map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-sub w-14">{s.kind}</span>
              <span className="flex-1 truncate">{s.title || s.external_id}</span>
              <span className="text-xs text-sub">{s.status}</span>
              <span className="text-xs text-sub">{s.occurred_at ? fmtDate(s.occurred_at) : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
