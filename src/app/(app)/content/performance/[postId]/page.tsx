import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostDetail } from "@/features/content/data/post-detail";
import ContentTabs from "@/features/content/ui/ContentTabs";
import PostFigures from "@/features/content/ui/PostFigures";
import PostTags from "@/features/content/ui/PostTags";
import RecreateControls from "@/features/content/ui/RecreateControls";
import RecreationsList from "@/features/content/ui/RecreationsList";
import WinnersBlock from "@/features/content/ui/WinnersBlock";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";

// Room for the Recreate action, which starts its work before the response returns.
export const maxDuration = 300;

/** The Performance query string the table link carried, so Back keeps the filters. Anything else is dropped. */
function backQuery(back: string | string[] | undefined): string {
  const v = Array.isArray(back) ? back[0] : back;
  return typeof v === "string" && /^\?[\w%=&.:+,-]*$/.test(v) ? v : "";
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { postId: string };
  searchParams: { back?: string | string[] };
}) {
  const { supabase, user } = await requireContentOwner();
  if (!z.string().uuid().safeParse(params.postId).success) notFound();
  const detail = await loadPostDetail(supabase, user.id, params.postId, new Date());
  if (!detail) notFound();
  const { post, figures, insights, live, recreations, sourceMultiplier } = detail;
  const firstLine = post.caption.split("\n")[0].slice(0, 140);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Link href={`/content/performance${backQuery(searchParams.back)}`} className="inline-block min-h-11 py-2 text-sm text-purple hover:underline">
        ← Back to Performance
      </Link>

      <Card>
        <div className="flex gap-4">
          {post.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.thumbnail_url} alt={firstLine || "Post thumbnail"} width={72} height={96} className="w-18 h-24 rounded object-cover shrink-0 bg-edge" />
          )}
          <div className="min-w-0">
            <p className="font-semibold break-words">{firstLine || "(no caption)"}</p>
            <p className="text-sm text-sub mt-1">
              {fmtDate(post.posted_at)} · {post.media_type || post.format || "post"} ·{" "}
              <a href={post.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">
                Open on Instagram
              </a>
            </p>
          </div>
        </div>
        <div className="mt-3">
          <PostTags id={post.id} row={post} />
        </div>
      </Card>

      <Card title="How it did">
        <PostFigures figures={figures} />
      </Card>

      <Card title="What it shares with your winners">
        <WinnersBlock insights={insights} />
      </Card>

      <Card title="Recreate">
        <RecreateControls postId={post.id} tagged={post.tagged_at !== null} live={live} />
      </Card>

      <Card title="Made from this post">
        <RecreationsList items={recreations} sourceMultiplier={sourceMultiplier} />
      </Card>
    </div>
  );
}
