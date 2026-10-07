import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getResultByToken } from "@/features/quiz/data/results";
import QuizShell from "@/features/quiz/ui/QuizShell";
import ResultView from "@/features/quiz/ui/ResultView";

export const metadata: Metadata = {
  title: "Your investor profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QuizResultPage({ params }: { params: { token: string } }) {
  const result = await getResultByToken(params.token);
  if (!result) notFound();

  return (
    <QuizShell>
      <ResultView result={result} />
    </QuizShell>
  );
}
