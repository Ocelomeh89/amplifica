import { requireContentOwner } from "@/features/content/data/owner";
import { supabaseCompetitorsDb } from "@/features/content/data/supabase-competitors-db";
import { supabaseDiscoveryDb } from "@/features/content/data/supabase-discovery-db";
import AddCreatorForm from "@/features/content/ui/AddCreatorForm";
import ContentTabs from "@/features/content/ui/ContentTabs";
import CreatorsTable from "@/features/content/ui/CreatorsTable";
import DroppedCreators from "@/features/content/ui/DroppedCreators";
import FindCreatorsButton from "@/features/content/ui/FindCreatorsButton";
import SuggestedCreators from "@/features/content/ui/SuggestedCreators";
import Card from "@/shared/ui/Card";

export default async function CreatorsPage() {
  const { supabase, user } = await requireContentOwner();
  const now = new Date();
  const [page, discovery] = await Promise.all([supabaseCompetitorsDb(supabase, user.id).creatorsPage(now), supabaseDiscoveryDb(supabase, user.id).discoveryPage(now)]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Card title="Creators">
        <p className="text-sm text-sub mb-3">
          Their Reels are pulled every Monday. A Reel at three times their typical views becomes a brief on Today.
        </p>
        <h2 className="text-sm font-semibold mb-2">Suggested</h2>
        <SuggestedCreators suggestions={discovery.suggestions} />
        <FindCreatorsButton left={discovery.findLeftToday} lastNote={discovery.lastNote} />
        <AddCreatorForm />
        <CreatorsTable page={page} />
        <DroppedCreators dropped={discovery.dropped} />
      </Card>
    </div>
  );
}
