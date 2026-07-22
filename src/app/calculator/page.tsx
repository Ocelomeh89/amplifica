import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import EmailGate from "./EmailGate";
import CalculatorClient from "./CalculatorClient";

export const metadata: Metadata = {
  title: "Flywheel Calculator — Amplifica",
  description:
    "Model the leverage flywheel: monthly savings, line of credit, and income investments compounding toward financial independence. Free interactive simulator.",
  openGraph: {
    title: "The Amplifica Flywheel Calculator",
    description:
      "Simulate a leverage flywheel wealth strategy and find your financial independence date.",
    type: "website",
    url: "/calculator",
  },
  twitter: {
    card: "summary",
    title: "The Amplifica Flywheel Calculator",
    description:
      "Simulate a leverage flywheel wealth strategy and find your financial independence date.",
  },
};

// Same five-bar mark as the Sidebar, with its own gradient id (this page
// never renders alongside the Sidebar, but ids must be unique per document).
function AmplitudeMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="amp-mark-public" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#A88BE8" />
          <stop offset="100%" stopColor="#6C4BD3" />
        </linearGradient>
      </defs>
      <g fill="url(#amp-mark-public)">
        <rect x="0" y="23" width="4" height="3" rx="1" />
        <rect x="6.5" y="21" width="4" height="5" rx="1" />
        <rect x="13" y="18" width="4" height="8" rx="1" />
        <rect x="19.5" y="12" width="4" height="14" rx="1" />
        <rect x="26" y="2" width="4" height="24" rx="1" />
      </g>
    </svg>
  );
}

export default function CalculatorPage({
  searchParams,
}: {
  searchParams: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
}) {
  const unlocked = cookies().get("amp_calc_unlocked")?.value === "1";

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="border-b border-edge bg-card">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AmplitudeMark />
            <span className="font-display text-lg leading-none">Amplifica</span>
          </div>
          <Link href="/login" className="text-sm text-purple hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        {unlocked ? <CalculatorClient /> : <EmailGate utm={searchParams} />}
      </main>

      <footer className="border-t border-edge">
        <div className="max-w-5xl mx-auto px-6 py-4 text-sm text-sub flex items-center justify-between">
          <span>Engineer your future. Amplify your wealth. Live your way.</span>
          <Link href="/signup" className="text-purple hover:underline">
            Create a free account
          </Link>
        </div>
      </footer>
    </div>
  );
}
