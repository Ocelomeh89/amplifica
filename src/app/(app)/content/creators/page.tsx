import { requireContentOwner } from "@/features/content/data/owner";
import { supabaseCompetitorsDb } from "@/features/content/data/supabase-competitors-db";
import AddCreatorForm from "@/features/content/ui/AddCreatorForm";
import ContentTabs from "@/features/content/ui/ContentTabs";
import CreatorsTable from "@/features/content/ui/CreatorsTable";
import Card from "@/shared/ui/Card";

export default async function CreatorsPage() {
  const { supabase, user } = await requireContentOwner();
  const page = await supabaseCompetitorsDb(supabase, user.id).creatorsPage(new Date());

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Card title="Creators">
        <p className="text-sm text-sub mb-3">
          Their Reels are pulled every Monday. A Reel at three times their typical views becomes a brief on Today.
        </p>
        <AddCreatorForm />
        <CreatorsTable page={page} />
      </Card>
    </div>
  );
}
