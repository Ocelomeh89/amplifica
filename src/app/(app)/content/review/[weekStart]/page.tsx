import { notFound } from "next/navigation";
import { requireContentOwner } from "@/features/content/data/owner";
import { loadReview, loadReviewSkips } from "@/features/content/data/queries";
import { loadSuggestionsSection, loadTestSection } from "@/features/content/data/review-sections";
import { loadTopics } from "@/features/content/data/topics";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { addDays, isWeekStart } from "@/features/content/engine/review";
import ContentTabs from "@/features/content/ui/ContentTabs";
import ReviewPage from "@/features/content/ui/ReviewPage";

export const maxDuration = 300;

// An earlier week's review, read-only. Routing and layout only: every read is in data/queries.ts.
export default async function ContentReviewWeekPage({ params }: { params: { weekStart: string } }) {
  if (!isWeekStart(params.weekStart)) notFound();
  const { supabase, user } = await requireContentOwner();
  const { row, weeks } = await loadReview(supabase, user.id, params.weekStart);
  const [skips, test, suggestions, topics] = await Promise.all([
    loadReviewSkips(supabase, user.id, addDays(params.weekStart, 7)),
    loadTestSection(user.id, params.weekStart),
    loadSuggestionsSection(user.id),
    loadTopics(supabase, user.id),
  ]);
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <ReviewPage review={row} weeks={weeks} skips={skips} gateFailed={[]} test={test} suggestions={suggestions} newest={weeks[0] === params.weekStart} topics={topics} today={chicagoIsoDate(new Date())} />
    </div>
  );
}
