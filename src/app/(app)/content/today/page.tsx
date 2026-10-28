import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { requireContentOwner } from "@/features/content/data/owner";
import { supabaseTodayDb } from "@/features/content/data/supabase-today-db";
import AutoRefresh from "@/features/content/ui/AutoRefresh";
import BriefCard from "@/features/content/ui/BriefCard";
import ContentTabs from "@/features/content/ui/ContentTabs";
import MakeNowButton from "@/features/content/ui/MakeNowButton";
import MomentForm from "@/features/content/ui/MomentForm";
import TallyTable from "@/features/content/ui/TallyTable";
import VerdictsList from "@/features/content/ui/VerdictsList";
import YouTubeSlots from "@/features/content/ui/YouTubeSlots";
import Card from "@/shared/ui/Card";

// Room for the background jobs the actions start before the response returns.
export const maxDuration = 300;

const heading = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export default async function TodayPage() {
  const { supabase, user } = await requireContentOwner();
  const now = new Date();
  const day = chicagoIsoDate(now);
  const page = await supabaseTodayDb(supabase, user.id).page(day, now);

  const bySlot = new Map(page.briefs.map((b) => [b.slot, b]));
  const cron = page.cronRun;
  const momentPending = page.pendingRuns.some((r) => r.kind === "moment");
  const working = cron?.status === "pending" || page.pendingRuns.length > 0;

  const empty = (slot: 1 | 2) => {
    if (cron?.status === "pending") return <p className="text-sm text-sub">Making your briefs… This takes a few minutes.</p>;
    if (cron?.status === "ready" && cron.error === "Inbox is empty") {
      return <p className="text-sm text-sub">Inbox is empty. Recreate a winner, or wait for tomorrow&apos;s ideas.</p>;
    }
    if (cron?.status === "ready") return <p className="text-sm text-sub">No brief here. Ideas in your Inbox fill it tomorrow.</p>;
    return (
      <div>
        <p className="text-sm mb-2">Not made yet.{cron?.status === "failed" && cron.error ? ` ${cron.error}.` : ""}</p>
        {slot === 1 && <MakeNowButton />}
      </div>
    );
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <AutoRefresh active={working} />
      <h2 className="text-lg font-semibold mb-1">Today, {heading(day)}</h2>
      <p className="text-sm text-sub mb-4">Three Instagram briefs. Each changes one thing against the recipe that already works, and is judged a week after you post it.</p>

      {([1, 2] as const).map((slot) => {
        const b = bySlot.get(slot);
        return b ? (
          <BriefCard key={b.id} brief={b} />
        ) : (
          <Card key={slot} title={`Brief ${slot}`}>
            {empty(slot)}
          </Card>
        );
      })}
      {bySlot.get(3) ? (
        <BriefCard brief={bySlot.get(3)!} />
      ) : momentPending ? (
        <Card title="From today">
          <p className="text-sm text-sub">Making your brief… This takes a few minutes.</p>
        </Card>
      ) : (
        <MomentForm />
      )}

      <Card title="Verdicts in">
        <VerdictsList items={page.verdicts} />
      </Card>
      <Card title="What we know so far">
        <TallyTable rows={page.tally} />
      </Card>
      <Card title="YouTube this week">
        <YouTubeSlots items={page.youtube} />
      </Card>
    </div>
  );
}
