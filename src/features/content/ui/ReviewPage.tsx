import Link from "next/link";
import type { ContentReview } from "@/shared/supabase/database.types";
import { PILLARS } from "@/features/content/engine/brand";
import type { FocusEntry } from "@/features/content/engine/focus";
import { addDays, summaryLine, type ReviewData, type ReviewPost, type Tile } from "@/features/content/engine/review";
import type { FocusRow } from "@/features/content/data/focus";
import type { GateFailedRow } from "@/features/content/data/queries";
import type { TestSection } from "@/features/content/data/review-sections";
import type { Topic } from "@/features/content/data/topics";
import BuildNowButton from "./BuildNowButton";
import GateFailedList from "./GateFailedList";
import { DoubleDownList, SkipList } from "./ReviewLists";
import Card from "@/shared/ui/Card";

const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function TileView({ label, tile }: { label: string; tile: Tile }) {
  return (
    <div className="flex-1 min-w-[7rem] rounded-lg bg-edge/40 p-3">
      <div className="text-xs uppercase tracking-wide text-sub">{label}</div>
      {tile.total === null ? (
        <div className="text-sm text-sub mt-1">not available</div>
      ) : (
        <>
          <div className="text-lg font-semibold">{tile.total.toLocaleString("en-US")}</div>
          {tile.multiple !== null && <div className="text-xs text-sub">{tile.multiple.toFixed(1)}x usual</div>}
        </>
      )}
    </div>
  );
}

function PostLine({ p }: { p: ReviewPost }) {
  return (
    <li className="py-2">
      <div className="text-sm">
        <Link href={`/content/performance/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
        {p.early && <span className="ml-2 text-xs rounded-full bg-edge/60 px-2 py-0.5 text-sub">early read</span>}
      </div>
      <div className="text-xs text-sub">
        {p.views !== null ? `${p.views.toLocaleString("en-US")} views` : "views not available"}
        {p.n_views !== null ? ` (${p.n_views.toFixed(1)}x)` : ""}
        {p.second ? ` · ${p.second.value.toLocaleString("en-US")} ${p.second.metric} (${p.second.multiple.toFixed(1)}x)` : ""}
      </div>
      {p.why && <div className="text-sm mt-1">{p.why}</div>}
    </li>
  );
}

function Posts({ title, posts, empty }: { title: string; posts: ReviewPost[]; empty: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {posts.length === 0 ? <p className="text-sm text-sub">{empty}</p> : <ul className="divide-y divide-edge">{posts.map((p) => <PostLine key={p.id} p={p} />)}</ul>}
    </div>
  );
}

export type ReviewPageProps = {
  review: ContentReview | null;
  weeks: string[];
  skips: FocusRow[];
  gateFailed: GateFailedRow[];
  test: TestSection | null;
  suggestions: { waiting: number; href: string } | null;
  /** True for the newest week's page: it carries Build now and the live gate failures with Archive. */
  newest: boolean;
  topics?: Topic[];
  /** Today (YYYY-MM-DD), so Bring back only shows on a skip that is still running. */
  today?: string;
};

/** The Monday page: what worked, what did not, what the engine now favors and skips, and the brand gate's week. */
export default function ReviewPage({ review, weeks, skips, gateFailed, test, suggestions, newest, topics = [], today }: ReviewPageProps) {
  if (!review) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-2">Weekly review</h2>
        <p className="text-sm text-sub mb-3">{newest ? "No review yet. The first one is built on Monday, or you can build it now." : "There is no review for this week."}</p>
        {newest && <BuildNowButton />}
        <EarlierWeeks weeks={weeks} current={null} />
      </div>
    );
  }
  const data = review.review as unknown as ReviewData;
  const doubleDown = (review.double_down ?? []) as unknown as FocusEntry[];
  const weekEnd = addDays(review.week_start, 6);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold">
          Weekly review · {shortDate(review.week_start)} to {shortDate(weekEnd)}
        </h2>
        {newest && <BuildNowButton />}
      </div>

      <Card>
        <p className="text-base font-semibold mb-1">{summaryLine(data.line)}</p>
        {review.narrative_md && <p className="text-sm mb-3">{review.narrative_md}</p>}
        <div className="flex flex-wrap gap-3">
          <TileView label="Views" tile={data.tiles.views} />
          <TileView label="Saves" tile={data.tiles.saves} />
          <TileView label="Shares" tile={data.tiles.shares} />
          <TileView label="Follows" tile={data.tiles.follows} />
        </div>
      </Card>

      <Card title="What worked and why">
        <Posts title="What worked" posts={data.worked} empty="No post beat your usual views." />
        <Posts title="What didn't" posts={data.didnt} empty="No post was far below usual." />
        {data.usual.length > 0 && (
          <p className="text-sm">
            {count(data.usual.length, "post was", "posts were")} about usual: {data.usual.map((u) => u.title).join(" · ")}
          </p>
        )}
        {data.too_early.length > 0 && <p className="text-sm text-sub">Too early to call: {data.too_early.map((u) => u.title).join(" · ")}</p>}
        <p className="text-xs text-sub mt-2">Early reads use the numbers so far. The lists below wait until a post is 7 days old.</p>
        {data.why === "failed" && <p className="text-xs text-sub mt-1">The explanations could not be written this time. The lists and numbers are complete.</p>}
      </Card>

      <DoubleDownList rows={doubleDown} topics={topics} />
      {data.untagged > 0 && (
        <p className="text-xs text-sub mb-2">
          {count(data.untagged, "post is", "posts are")} not tagged yet, so no new skip was decided this week. Existing skips are unchanged.
        </p>
      )}
      <SkipList rows={skips} topics={topics} today={today} />

      {test && (
        <Card title="This week's test">
          <p className="text-sm">{test.question}</p>
          {test.state === "open" && test.owes.length > 0 && <p className="text-xs text-sub mt-1">Still to do: {test.owes.join(", ")}</p>}
          {test.state === "judged" && test.conclusion && <p className="text-sm mt-1">{test.verdict ? `${test.verdict}. ` : ""}{test.conclusion}</p>}
          <Link href={test.href} className="text-xs text-purple hover:underline">Open the test</Link>
        </Card>
      )}
      {suggestions && (
        <Card title="New creator suggestions">
          <p className="text-sm">
            {count(suggestions.waiting, "suggestion waits", "suggestions wait")} for your answer.{" "}
            <Link href={suggestions.href} className="text-purple hover:underline">See them</Link>
          </p>
        </Card>
      )}

      <Card title="Pillar spread">
        <ul className="text-sm space-y-1">
          {PILLARS.map((p) => {
            const row = data.pillars.find((x) => x.pillar === p.slug);
            const posts = row?.posts ?? 0;
            return (
              <li key={p.slug} className="flex justify-between gap-3">
                <span>{p.name}</span>
                <span className="text-sub">
                  {count(posts, "post", "posts")} · {row?.median_multiple != null ? `${row.median_multiple.toFixed(1)}x usual views` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Brand gate this week">
        <p className="text-sm mb-2">
          {count(data.gate.checked, "idea", "ideas")} checked. {data.gate.passed} passed as written, {data.gate.rewritten} after a rewrite, {data.gate.failed} didn&apos;t pass.
        </p>
        {newest ? (
          <GateFailedList rows={gateFailed} />
        ) : (
          data.gate.failures.length > 0 && (
            <ul className="text-sm space-y-2">
              {data.gate.failures.map((f) => (
                <li key={f.id}>
                  <div className="font-medium">{f.title}</div>
                  <ul className="text-xs text-sub list-disc pl-4">
                    {f.reasons.map((r, k) => (
                      <li key={k}>{r}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      <EarlierWeeks weeks={weeks} current={review.week_start} />
    </div>
  );
}

function EarlierWeeks({ weeks, current }: { weeks: string[]; current: string | null }) {
  const others = weeks.filter((w) => w !== current);
  if (others.length === 0) return null;
  return (
    <p className="text-xs text-sub mt-2">
      Earlier weeks:{" "}
      {others.map((w, k) => (
        <span key={w}>
          {k > 0 && " · "}
          <Link href={`/content/review/${w}`} className="text-purple hover:underline">{shortDate(w)}</Link>
        </span>
      ))}
    </p>
  );
}
