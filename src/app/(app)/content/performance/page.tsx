import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import AttributionPanels from "@/features/content/ui/AttributionPanels";
import PerformanceTable from "@/features/content/ui/PerformanceTable";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { attribute } from "@/features/content/engine/attribution";

export default async function ContentPerformancePage() {
  const { supabase, user } = await requireContentOwner();
  const posts = await loadPostsForMath(supabase, user.id);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const normalized = normalizePosts(posts, new Date());
  const { groups, doubleDown, stop } = attribute(normalized);
  const rows = normalized.map((n) => {
    const p = byId.get(n.id)!;
    return { ...n, url: p.url, caption: p.caption, idea_id: p.idea_id };
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      {posts.length === 0 ? (
        <p className="text-sm text-sub">No posts yet. The metrics cron fills this every morning; Mark posted on a queued idea adds one by hand.</p>
      ) : (
        <>
          <AttributionPanels groups={groups} doubleDown={doubleDown} stop={stop} />
          <Card title={`Posts (${rows.length})`}>
            <PerformanceTable rows={rows} />
          </Card>
        </>
      )}
    </div>
  );
}
