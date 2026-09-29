import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import Heatmap from "@/features/content/ui/Heatmap";
import PlanGrid from "@/features/content/ui/PlanGrid";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { bestTimes, chicagoIsoDate } from "@/features/content/engine/best-times";
import { buildPlan, DEFAULT_CADENCE, mondayOf, type QueueIdea } from "@/features/content/engine/plan";
import { FORMATS, type Format } from "@/features/content/engine/types";

export default async function ContentWeekPage() {
  const { supabase, user } = await requireContentOwner();
  const [posts, { data: queued }] = await Promise.all([
    loadPostsForMath(supabase, user.id),
    supabase
      .from("content_ideas")
      .select("id, format, hook, chain_id")
      .eq("user_id", user.id)
      .eq("status", "queued")
      .order("queue_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const cells = bestTimes(normalizePosts(posts, new Date()));
  const queues = Object.fromEntries(FORMATS.map((f) => [f, [] as QueueIdea[]])) as Record<Format, QueueIdea[]>;
  for (const q of queued ?? []) queues[q.format as Format].push({ id: q.id, format: q.format as Format, hook: q.hook, chain_id: q.chain_id });

  const now = new Date();
  const thisMonday = mondayOf(new Date(`${chicagoIsoDate(now)}T00:00:00Z`));
  const nextMondayDate = new Date(`${thisMonday}T00:00:00Z`);
  nextMondayDate.setUTCDate(nextMondayDate.getUTCDate() + 7);
  const weekStart = nextMondayDate.toISOString().slice(0, 10);
  const slots = buildPlan({ weekStart, cadence: DEFAULT_CADENCE, cells, queues });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Card title="Best times (America/Chicago)">
        {posts.length === 0 ? <p className="text-sm text-sub">No posted log yet. Defaults fill the plan until there is one.</p> : <Heatmap cells={cells} />}
      </Card>
      <Card title={`Plan for the week of ${weekStart}`}>
        <p className="text-xs text-sub mb-3">3 Reels, 1 newsletter, YouTube every second week, a Story on every posting day. Ideas come from the queues in rank order; chained ideas travel together.</p>
        <PlanGrid slots={slots} />
      </Card>
    </div>
  );
}
