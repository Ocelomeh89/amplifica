import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import IdeaCard from "@/features/content/ui/IdeaCard";
import FormatBadge from "@/features/content/ui/FormatBadge";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";
import type { Format } from "@/features/content/engine/types";

export default async function ContentIdeaPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireContentOwner();

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!idea) notFound();

  const [{ data: source }, { data: mates }, { data: post }] = await Promise.all([
    idea.source_id
      ? supabase.from("content_sources").select("*").eq("id", idea.source_id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    idea.chain_id
      ? supabase
          .from("content_ideas")
          .select("id, format, hook, status")
          .eq("chain_id", idea.chain_id)
          .eq("user_id", user.id)
          .neq("id", idea.id)
      : Promise.resolve({ data: [] as { id: string; format: Format; hook: string; status: string }[] }),
    supabase
      .from("content_posts")
      .select("*")
      .eq("idea_id", idea.id)
      .eq("user_id", user.id)
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Link href="/content" className="text-xs text-sub hover:underline">← Inbox</Link>

      <div className="mt-3">
        <IdeaCard
          idea={idea}
          sourceUrl={source?.url ?? null}
          siblings={(mates ?? []).map((m) => ({ id: m.id, format: m.format }))}
        />
      </div>

      <Card title="Status">
        <dl className="text-sm grid grid-cols-2 gap-2">
          <dt className="text-sub">Status</dt><dd>{idea.status}{idea.queue_rank ? ` (rank ${idea.queue_rank})` : ""}</dd>
          <dt className="text-sub">Batch</dt><dd>{idea.batch_date}</dd>
          {idea.feedback_reason && (<><dt className="text-sub">Pass reason</dt><dd>{idea.feedback_reason}</dd></>)}
          {idea.hook_alt && (<><dt className="text-sub">Trial hook</dt><dd>{idea.hook_alt}</dd></>)}
          {post && (
            <>
              <dt className="text-sub">Posted</dt>
              <dd>
                <a href={post.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">{post.platform}</a>
                {" "}{fmtDate(post.posted_at)}
              </dd>
            </>
          )}
        </dl>
      </Card>

      {source && (
        <Card title="Source">
          <div className="text-sm flex items-center gap-2">
            <span className="text-[10px] uppercase text-sub">{source.kind}</span>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">{source.title || source.external_id}</a>
            ) : (
              <span>{source.title || source.external_id}</span>
            )}
            {source.occurred_at && <span className="text-sub text-xs">{fmtDate(source.occurred_at)}</span>}
          </div>
        </Card>
      )}

      {(mates ?? []).length > 0 && (
        <Card title="Same recording">
          <ul className="text-sm space-y-1">
            {(mates ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <FormatBadge format={m.format} />
                <Link href={`/content/ideas/${m.id}`} className="hover:underline truncate">{m.hook}</Link>
                <span className="text-xs text-sub ml-auto">{m.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
