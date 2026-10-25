import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import AttributionPanels from "@/features/content/ui/AttributionPanels";
import OverviewCards from "@/features/content/ui/OverviewCards";
import PerformanceTable from "@/features/content/ui/PerformanceTable";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { attribute } from "@/features/content/engine/attribution";
import { filteredCards } from "@/features/content/engine/performance-view";
import { parseWindow } from "@/features/content/engine/overview";
import { parseTagFilters } from "@/features/content/engine/tags";
import TagFilters from "@/features/content/ui/TagFilters";

export default async function ContentPerformancePage({ searchParams }: { searchParams: { window?: string; tag?: string | string[] } }) {
  const { supabase, user } = await requireContentOwner();
  const window = parseWindow(searchParams.window);
  const now = new Date();
  const posts = await loadPostsForMath(supabase, user.id);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const normalized = normalizePosts(posts, now);
  const { groups, doubleDown, stop } = attribute(normalized);
  const filters = parseTagFilters(searchParams.tag);
  // Baselines and scores come from every post; the filter only narrows what is shown.
  const { cards, visibleIds, scores } = filteredCards(posts, filters, now, window);
  const scoreOf = new Map(scores.map((s) => [s.id, s]));
  const rows = normalized.filter((n) => visibleIds.has(n.id)).map((n) => {
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
      onscreen_text: p.onscreen_text,
      message: p.message,
      cta_type: p.cta_type,
      post_style: p.post_style,
      cover_face: p.cover_face,
      cover_text: p.cover_text,
      cover_number: p.cover_number,
      hook_spoken: p.hook_spoken,
      hook_onscreen: p.hook_onscreen,
      tag_confidence: p.tag_confidence,
      tag_locks: p.tag_locks,
      tagged_at: p.tagged_at,
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
            <TagFilters filters={filters} />
            <PerformanceTable rows={rows} />
          </Card>
        </>
      )}
    </div>
  );
}
