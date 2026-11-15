import { requireContentOwner } from "@/features/content/data/owner";
import { supabaseTestsDb } from "@/features/content/data/supabase-tests-db";
import AutoRefresh from "@/features/content/ui/AutoRefresh";
import ContentTabs from "@/features/content/ui/ContentTabs";
import PastTestsList from "@/features/content/ui/PastTestsList";
import ProposeTestButton from "@/features/content/ui/ProposeTestButton";
import TestCard from "@/features/content/ui/TestCard";
import Card from "@/shared/ui/Card";

// Room for the proposal, which the Propose button starts before the response returns.
export const maxDuration = 300;

export default async function TestsPage() {
  const { supabase, user } = await requireContentOwner();
  const page = await supabaseTestsDb(supabase, user.id).page(new Date());

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <AutoRefresh active={page.proposing} />

      {page.open ? (
        <TestCard test={page.open} labels={page.labels} />
      ) : (
        <Card title="Next test">
          {page.proposing ? (
            <p className="text-sm text-sub">Proposing a test… This takes a few minutes.</p>
          ) : (
            <>
              <p className="text-sm text-sub mb-3">The engine picks one test at a time: two versions of one Reel that differ in one thing.</p>
              {page.lastFailed && <p role="alert" className="text-sm text-red-600 mb-3">{page.lastFailed.error}</p>}
              <ProposeTestButton proposalsLeft={page.proposalsLeft} />
            </>
          )}
        </Card>
      )}

      {!page.open && page.latest && <TestCard test={page.latest} labels={page.labels} />}
      <PastTestsList tests={page.past} />
    </div>
  );
}
