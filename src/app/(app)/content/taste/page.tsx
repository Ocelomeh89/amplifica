import { requireContentOwner } from "@/features/content/data/owner";
import { supabaseTasteDb } from "@/features/content/data/supabase-taste-db";
import ContentTabs from "@/features/content/ui/ContentTabs";
import TasteRules from "@/features/content/ui/TasteRules";
import Card from "@/shared/ui/Card";

export default async function TastePage() {
  const { supabase, user } = await requireContentOwner();
  const page = await supabaseTasteDb(supabase, user.id).page(new Date());

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Card title="Taste">
        <p className="text-sm text-sub mb-4">
          Every note you give, from Sharpen or from a Pass, becomes evidence. The engine proposes rules from them. A rule shapes
          nothing until you approve it here.
        </p>
        <TasteRules page={page} />
      </Card>
    </div>
  );
}
