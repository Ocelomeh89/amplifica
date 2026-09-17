import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import InboxList from "@/features/content/ui/InboxList";
import PendingSourcesStrip from "@/features/content/ui/PendingSourcesStrip";
import type { Format } from "@/features/content/engine/types";

export default async function ContentInboxPage() {
  const { supabase, user } = await requireContentOwner();

  const [{ data: ideas }, { data: pending }] = await Promise.all([
    supabase
      .from("content_ideas")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "inbox")
      .order("batch_date", { ascending: false })
      .order("score", { ascending: false }),
    supabase
      .from("content_sources")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("occurred_at", { ascending: false }),
  ]);

  const list = ideas ?? [];
  const sourceIds = Array.from(new Set(list.map((i) => i.source_id).filter((s): s is string => Boolean(s))));
  const chainIds = Array.from(new Set(list.map((i) => i.chain_id).filter((c): c is string => Boolean(c))));

  const [{ data: sources }, { data: chainMates }] = await Promise.all([
    sourceIds.length
      ? supabase.from("content_sources").select("id, url").in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; url: string | null }[] }),
    chainIds.length
      ? supabase.from("content_ideas").select("id, format, chain_id").in("chain_id", chainIds)
      : Promise.resolve({ data: [] as { id: string; format: Format; chain_id: string | null }[] }),
  ]);

  const sourceUrls = Object.fromEntries((sources ?? []).map((s) => [s.id, s.url]));
  const siblingsById: Record<string, { id: string; format: Format }[]> = {};
  for (const idea of list) {
    if (!idea.chain_id) continue;
    siblingsById[idea.id] = (chainMates ?? [])
      .filter((m) => m.chain_id === idea.chain_id && m.id !== idea.id)
      .map((m) => ({ id: m.id, format: m.format }));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <PendingSourcesStrip sources={pending ?? []} />
      <InboxList ideas={list} sourceUrls={sourceUrls} siblingsById={siblingsById} />
    </div>
  );
}
