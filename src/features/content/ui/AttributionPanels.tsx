import type { Group } from "@/features/content/engine/attribution";
import Card from "@/shared/ui/Card";

const LABEL: Record<Group["dimension"], string> = { format: "Format", pillar: "Pillar", hook_type: "Hook type", hook_length: "Hook length" };
const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}×`);

function GroupLine({ g }: { g: Group }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="text-sub w-24 shrink-0">{LABEL[g.dimension]}</span>
      <span className="font-medium">{g.key}</span>
      <span className="text-sub text-xs">{g.count} {g.count === 1 ? "post" : "posts"}</span>
      {g.thin && <span className="text-[10px] uppercase tracking-wide rounded px-1 border border-edge text-sub">thin evidence</span>}
      <span className="ml-auto tabular-nums">{x(g.score)}</span>
    </li>
  );
}

export default function AttributionPanels({ groups, doubleDown, stop }: { groups: Group[]; doubleDown: Group[]; stop: Group[] }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Double down">
          {doubleDown.length === 0 ? (
            <p className="text-sm text-sub">Needs at least one group with 3 posts and metrics.</p>
          ) : (
            <ul className="space-y-2">{doubleDown.map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}</ul>
          )}
        </Card>
        <Card title="Stop">
          {stop.length === 0 ? (
            <p className="text-sm text-sub">Nothing to stop yet.</p>
          ) : (
            <ul className="space-y-2">{stop.map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}</ul>
          )}
        </Card>
      </div>
      <Card title="All groups">
        <p className="text-xs text-sub mb-3">Score is the mean of the group&apos;s median normalized saves and shares. 1.00× is the 60-day typical post for that platform and format.</p>
        <ul className="space-y-2">
          {[...groups].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}
        </ul>
      </Card>
    </>
  );
}
