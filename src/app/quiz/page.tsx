import type { Metadata } from "next";
import QuizClient from "@/features/quiz/ui/QuizClient";
import QuizShell from "@/features/quiz/ui/QuizShell";

export const metadata: Metadata = {
  title: "What kind of investor are you?",
  description:
    "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
  alternates: { canonical: "/quiz" },
  openGraph: {
    title: "What kind of investor are you? | Amplifica Wealth",
    description:
      "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
    type: "website",
    url: "/quiz",
  },
  twitter: {
    card: "summary",
    title: "What kind of investor are you? | Amplifica Wealth",
    description:
      "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
  },
};

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

export default function QuizPage({
  searchParams,
}: {
  searchParams: { utm_source?: Param; utm_medium?: Param; utm_campaign?: Param };
}) {
  return (
    <QuizShell>
      <QuizClient
        utm={{
          utm_source: first(searchParams.utm_source),
          utm_medium: first(searchParams.utm_medium),
          utm_campaign: first(searchParams.utm_campaign),
        }}
      />
    </QuizShell>
  );
}
