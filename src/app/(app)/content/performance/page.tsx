import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import AttributionPanels from "@/features/content/ui/AttributionPanels";
import OverviewCards from "@/features/content/ui/OverviewCards";
import PerformanceTable from "@/features/content/ui/PerformanceTable";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { attribute } from "@/features/content/engine/attribution";
import { baselineGroup, scorePosts } from "@/features/content/engine/baseline";
import { overviewCards, parseWindow } from "@/features/content/engine/overview";

export default async function ContentPerformancePage({ searchParams }: { searchParams: { window?: string } }) {
  const { supabase, user } = await requireContentOwner();
  const window = parseWindow(searchParams.window);
  const now = new Date();
  const posts = await loadPostsForMath(supabase, user.id);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const normalized = normalizePosts(posts, now);
  const { groups, doubleDown, stop } = attribute(normalized);
  const { baselines, scores } = scorePosts(posts, now);
  const scoreOf = new Map(scores.map((s) => [s.id, s]));
  const cards = overviewCards(
    posts.map((p) => ({ id: p.id, posted_at: p.posted_at, group: baselineGroup(p) })),
    scores,
    baselines,
    now,
    window
  );
  const rows = normalized.map((n) => {
    const p = byId.get(n.id)!;
    const s = scoreOf.get(n.id)!;
    // The views series is server-only: keep it out of the client table's props.
    const { series: _series, ...rest } = n as typeof n & { series?: unknown };
    void _series;
    return {
      ...rest,
      url: p.url,
      caption: p.caption,
      idea_id: p.idea_id,
      views: s.views,
      n_views: s.multiplier.n_views,
      n_views_mode: s.multiplier.mode,
      n_views_day: s.multiplier.day,
      n_views_thin: s.multiplier.thin,
      status: s.status,
      evergreen: s.evergreen,
    };
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      {posts.length === 0 ? (
        <p className="text-sm text-sub">No posts yet. The metrics cron fills this every morning; Mark posted on a queued idea adds one by hand.</p>
      ) : (
        <>
          <OverviewCards cards={cards} window={window} />
          <AttributionPanels groups={groups} doubleDown={doubleDown} stop={stop} />
          <Card title={`Posts (${rows.length})`}>
            <PerformanceTable rows={rows} />
          </Card>
        </>
      )}
    </div>
  );
}
