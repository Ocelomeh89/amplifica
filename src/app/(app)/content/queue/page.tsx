import Link from "next/link";
import clsx from "clsx";
import { requireContentOwner } from "@/features/content/data/owner";
import ContentTabs from "@/features/content/ui/ContentTabs";
import QueueCard from "@/features/content/ui/QueueCard";
import { FORMATS, FORMAT_LABEL, type Format } from "@/features/content/engine/types";

export default async function ContentQueuePage({ searchParams }: { searchParams: { format?: string } }) {
  const { supabase, user } = await requireContentOwner();
  const format: Format = FORMATS.includes(searchParams.format as Format) ? (searchParams.format as Format) : "reel";

  const { data: queued } = await supabase
    .from("content_ideas")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "queued")
    .order("queue_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const all = queued ?? [];
  const counts = Object.fromEntries(FORMATS.map((f) => [f, all.filter((i) => i.format === f).length])) as Record<Format, number>;
  const list = all.filter((i) => i.format === format);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <div className="flex gap-1 mb-4">
        {FORMATS.map((f) => (
          <Link
            key={f}
            href={`/content/queue?format=${f}`}
            className={clsx(
              "text-sm px-3 py-1 rounded-full border",
              f === format ? "bg-purple text-white border-purple" : "border-edge text-sub hover:text-ink"
            )}
          >
            {FORMAT_LABEL[f]} <span className="opacity-70">{counts[f]}</span>
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-sub">Nothing queued for {FORMAT_LABEL[format]} yet. Like an idea in the Inbox to add one.</p>
      ) : (
        list.map((idea, i) => <QueueCard key={idea.id} idea={idea} position={i} total={list.length} />)
      )}
    </div>
  );
}
