import type { Metadata } from "next";
import { cookies } from "next/headers";
import EmailGate from "@/features/calculator/ui/EmailGate";
import CalculatorClient from "@/features/calculator/ui/CalculatorClient";
import InfoSections from "@/features/calculator/ui/InfoSections";
import PublicHeader from "@/shared/ui/public/PublicHeader";
import PublicFooter from "@/shared/ui/public/PublicFooter";

export const metadata: Metadata = {
  title: "Financial Optionality Calculator",
  description:
    "Free calculator: see when your monthly savings could become monthly investment income, and when you could stop contributing. Month-by-month amortization model, real assumptions, no promised returns.",
  alternates: { canonical: "/calculator" },
  openGraph: {
    title: "Financial Optionality Calculator | Amplifica Wealth",
    description:
      "See when your monthly savings could become monthly investment income, and when you could stop contributing. No promised returns.",
    type: "website",
    url: "/calculator",
  },
  twitter: {
    card: "summary",
    title: "Financial Optionality Calculator | Amplifica Wealth",
    description:
      "See when your monthly savings could become monthly investment income, and when you could stop contributing. No promised returns.",
  },
};

export default function CalculatorPage({
  searchParams,
}: {
  searchParams: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
}) {
  const unlocked = cookies().get("amp_calc_unlocked")?.value === "1";

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <PublicHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        <div className="max-w-3xl mb-6">
          <h1 className="font-display text-2xl mb-2">Financial optionality calculator</h1>
          <p className="text-sm text-sub leading-relaxed">
            Financial optionality is the point where your investments&apos; monthly cash
            flow covers your target income on its own. Work becomes a choice. This
            free calculator simulates, month by month, how consistent savings and a
            line of credit can build that cash flow, and estimates your date.
          </p>
        </div>

        {unlocked ? <CalculatorClient /> : <EmailGate utm={searchParams} />}

        <InfoSections />
      </main>

      <PublicFooter />
    </div>
  );
}
