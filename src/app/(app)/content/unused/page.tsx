import { requireContentOwner } from "@/features/content/data/owner";
import { loadUnused } from "@/features/content/data/queries";
import ContentTabs from "@/features/content/ui/ContentTabs";
import UnusedCard from "@/features/content/ui/UnusedCard";
import { UNPOSTED_DAYS, UNREVIEWED_DAYS } from "@/features/content/engine/unused";

export default async function ContentUnusedPage() {
  const { supabase, user } = await requireContentOwner();
  const { ideas, drafts } = await loadUnused(supabase, user.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <p className="text-sm text-sub mb-3">
        {ideas.length} idea{ideas.length === 1 ? "" : "s"} never used. Unreviewed for over {UNREVIEWED_DAYS} days, or liked
        and not posted for over {UNPOSTED_DAYS}. Passed and archived ideas are not listed.
      </p>
      {ideas.length === 0 ? (
        <p className="text-sm text-sub">Nothing has aged out.</p>
      ) : (
        ideas.map((idea) => <UnusedCard key={idea.id} idea={idea} draft={drafts[idea.id] ?? null} />)
      )}
    </div>
  );
}
