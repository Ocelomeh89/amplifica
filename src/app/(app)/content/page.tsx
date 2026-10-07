import { requireContentOwner } from "@/features/content/data/owner";
import { loadInbox, loadInboxLinks } from "@/features/content/data/queries";
import ContentTabs from "@/features/content/ui/ContentTabs";
import InboxList from "@/features/content/ui/InboxList";
import InboxFilter from "@/features/content/ui/InboxFilter";
import PendingSourcesStrip from "@/features/content/ui/PendingSourcesStrip";
import { FORMAT_LABEL, type Format } from "@/features/content/engine/types";
import FoundContentForm from "@/features/content/ui/FoundContentForm";
import { foundBadge } from "@/features/content/engine/angle";
import { filterByFormat, formatCounts, parseFormatParam, rankIdeas } from "@/features/content/engine/inbox";

export const maxDuration = 300;

export default async function ContentInboxPage({
  searchParams,
}: {
  searchParams?: { format?: string | string[] };
}) {
  const { supabase, user } = await requireContentOwner();

  const { ideas, pending } = await loadInbox(supabase, user.id);

  // Rank the whole Inbox by score, count per type from the full list, then
  // filter. The Inbox holds tens of ideas, so this stays in memory.
  const ranked = rankIdeas(ideas);
  const active = parseFormatParam(searchParams?.format);
  const counts = formatCounts(ranked);
  const list = filterByFormat(ranked, active);

  const sourceIds = Array.from(new Set(list.map((i) => i.source_id).filter((s): s is string => Boolean(s))));
  const chainIds = Array.from(new Set(list.map((i) => i.chain_id).filter((c): c is string => Boolean(c))));

  const { sources, chainMates } = await loadInboxLinks(supabase, user.id, sourceIds, chainIds);

  const sourceUrls = Object.fromEntries(sources.map((s) => [s.id, s.url]));
  const sourceById = Object.fromEntries(sources.map((s) => [s.id, s]));
  const badges = Object.fromEntries(
    list.map((i) => {
      const s = i.source_id ? sourceById[i.source_id] : null;
      return [i.id, s ? foundBadge(s.kind, { angle: s.angle }) : null];
    })
  );
  const siblingsById: Record<string, { id: string; format: Format }[]> = {};
  for (const idea of list) {
    if (!idea.chain_id) continue;
    siblingsById[idea.id] = chainMates
      .filter((m) => m.chain_id === idea.chain_id && m.id !== idea.id)
      .map((m) => ({ id: m.id, format: m.format }));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <PendingSourcesStrip sources={pending} />
      <details className="mb-4 bg-card border border-edge rounded-lg p-3">
        <summary className="text-sm cursor-pointer">Add found content</summary>
        <div className="mt-3"><FoundContentForm canGenerate={Boolean(process.env.ANTHROPIC_API_KEY)} /></div>
      </details>
      <InboxFilter active={active} counts={counts} />
      {active && list.length === 0 ? (
        <p className="text-sm text-sub">No {FORMAT_LABEL[active]} ideas in the Inbox.</p>
      ) : (
        <InboxList key={active ?? "all"} ideas={list} sourceUrls={sourceUrls} siblingsById={siblingsById} badges={badges} />
      )}
    </div>
  );
}
