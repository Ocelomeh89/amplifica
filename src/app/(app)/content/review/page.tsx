import { requireContentOwner } from "@/features/content/data/owner";
import { loadGateFailed, loadReview, loadReviewSkips } from "@/features/content/data/queries";
import { loadSuggestionsSection, loadTestSection } from "@/features/content/data/review-sections";
import { loadTopics } from "@/features/content/data/topics";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { addDays } from "@/features/content/engine/review";
import ContentTabs from "@/features/content/ui/ContentTabs";
import ReviewPage from "@/features/content/ui/ReviewPage";

export const maxDuration = 300;

// The newest weekly review. Routing and layout only: every read is in data/queries.ts.
export default async function ContentReviewPage() {
  const { supabase, user } = await requireContentOwner();
  const { row, weeks } = await loadReview(supabase, user.id, null);
  const weekStart = row?.week_start ?? null;
  const [skips, gateFailed, test, suggestions, topics] = await Promise.all([
    weekStart ? loadReviewSkips(supabase, user.id, addDays(weekStart, 7)) : Promise.resolve([]),
    loadGateFailed(supabase, user.id),
    weekStart ? loadTestSection(user.id, weekStart) : Promise.resolve(null),
    loadSuggestionsSection(user.id),
    loadTopics(supabase, user.id),
  ]);
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <ReviewPage review={row} weeks={weeks} skips={skips} gateFailed={gateFailed} test={test} suggestions={suggestions} newest topics={topics} today={chicagoIsoDate(new Date())} />
    </div>
  );
}
