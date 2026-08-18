import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import EmailGate from "./EmailGate";
import CalculatorClient from "./CalculatorClient";
import InfoSections from "./InfoSections";

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
          <Link
            href="/"
            aria-label="Amplifica Wealth home"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <AmplitudeMark />
            <span className="font-display text-lg leading-none">Amplifica</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-sub hover:text-purple transition-colors">
              Home
            </Link>
            <Link href="/login" className="text-purple hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

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

      <footer className="border-t border-edge">
        <div className="max-w-5xl mx-auto px-6 py-4 text-sm text-sub flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Engineer your future. Amplify your wealth. Live your way.</span>
          <div className="flex items-center gap-5">
            <Link href="/" className="text-purple hover:underline">
              Home
            </Link>
            <a
              href="https://community.amplificawealth.com/home-page"
              className="text-purple hover:underline"
            >
              Join the community
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
