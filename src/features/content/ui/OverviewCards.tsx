import Link from "next/link";
import clsx from "clsx";
import Card from "@/shared/ui/Card";
import { WINDOWS, type OverviewCard, type Window } from "@/features/content/engine/overview";
import { EvergreenBadge, StatusBadge, ThinBadge } from "./StatusBadge";

const n = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString("en-US"));

function CardBody({ c }: { c: OverviewCard }) {
  const counts = [
    { status: "Viral" as const, count: c.viral },
    { status: "Promising" as const, count: c.promising },
    { status: "Lagging" as const, count: c.lagging },
  ].filter((x) => x.count > 0);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{c.label}</h3>
        <span className="text-xs text-sub whitespace-nowrap">{c.posts} {c.posts === 1 ? "post" : "posts"}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{n(c.p50)}</p>
      <p className="text-xs text-sub">typical views, 90 days</p>
      <p className="mt-1 text-xs text-sub tabular-nums">P90 {n(c.p90)}</p>
      {(c.thin || c.thinDay7) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.thin && <ThinBadge label="thin baseline" />}
          {c.thinDay7 && <ThinBadge label="thin at day 7" />}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {counts.length === 0 && c.evergreen === 0 ? (
          <span className="text-xs text-sub">no rated posts yet</span>
        ) : (
          <>
            {counts.map((x) => (
              <span key={x.status} className="inline-flex items-center gap-1">
                <StatusBadge status={x.status} /> <span className="tabular-nums">{x.count}</span>
              </span>
            ))}
            {c.evergreen > 0 && (
              <span className="inline-flex items-center gap-1">
                <EvergreenBadge /> <span className="tabular-nums">{c.evergreen}</span>
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function OverviewCards({ cards, window }: { cards: OverviewCard[]; window: Window }) {
  return (
    <section aria-label="Overview" className="mb-2">
      <nav aria-label="Post window" className="flex flex-wrap items-center gap-1 mb-3">
        <span className="text-sm text-sub mr-1">Posts from the last</span>
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/content/performance?window=${w}`}
            aria-current={w === window ? "true" : undefined}
            className={clsx("px-3 py-2 text-sm rounded", w === window ? "bg-purple/10 text-purple font-medium" : "text-sub hover:text-ink")}
          >
            {w} days
          </Link>
        ))}
      </nav>
      {cards.length === 0 ? (
        <p className="text-sm text-sub mb-4">No posts in this window.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4">
          {cards.map((c) => (
            <CardBody key={c.group} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}
