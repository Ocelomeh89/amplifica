import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: { absolute: "Amplifica Wealth — savings into monthly investment income" },
  description:
    "A scalable system for turning consistent savings into monthly investment income: deploy borrowed capital into income investments, collect, repay, repeat. Free calculator, weekly letter, real numbers. No promised returns.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Amplifica Wealth",
    description:
      "Turn consistent savings into monthly investment income. A mathematical system, not investment tips. No promised returns, ever.",
    type: "website",
    url: "/",
  },
};

const NEWSLETTER_URL = "https://amplifica-wealth.beehiiv.com";
const COMMUNITY_URL = "https://community.amplificawealth.com";

function AmplitudeMark({ id }: { id: string }) {
  return (
    <svg width="26" height="22" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#A88BE8" />
          <stop offset="100%" stopColor="#6C4BD3" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        <rect x="0" y="23" width="4" height="3" rx="1" />
        <rect x="6.5" y="21" width="4" height="5" rx="1" />
        <rect x="13" y="18" width="4" height="8" rx="1" />
        <rect x="19.5" y="12" width="4" height="14" rx="1" />
        <rect x="26" y="2" width="4" height="24" rx="1" />
      </g>
    </svg>
  );
}

// The brand's five-bar mark expanded into a nine-bar amplification: each bar
// ~1.45x the last, the final one aqua — the cycle compounding. Purely
// decorative; grows once on load.
function AmplitudeField() {
  const bars = [7, 10, 15, 21, 31, 45, 65, 94, 136];
  const gap = 22;
  return (
    <svg
      viewBox="0 0 200 140"
      className="w-full max-w-[420px]"
      fill="none"
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * gap}
          y={140 - h}
          width={13}
          height={h}
          rx={3}
          fill={i === bars.length - 1 ? "#3EC9C0" : "#6C4BD3"}
          opacity={i === bars.length - 1 ? 1 : 0.25 + i * 0.09}
          className="grow-bar"
          style={{ animationDelay: `${200 + i * 70}ms` }}
        />
      ))}
    </svg>
  );
}

const cycle = [
  {
    step: "Deploy",
    text: "Draw on a line of credit and fund an amortized income investment.",
  },
  {
    step: "Collect",
    text: "Its level monthly payments arrive the next month.",
  },
  {
    step: "Repay",
    text: "The investment payouts, plus your monthly contribution, pay down the borrowed money.",
  },
  {
    step: "Repeat",
    text: "Each payoff funds the next, larger deployment. One completed cycle is an Amplicon.",
  },
];

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-cream text-ink">
      {/* ——— Header ——— */}
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-baseline justify-between">
        <div className="flex items-center gap-2.5">
          <AmplitudeMark id="amp-mark-home" />
          <span className="font-display text-xl leading-none">Amplifica Wealth</span>
        </div>
        <nav className="flex items-baseline gap-6 text-sm">
          <Link href="/calculator" className="hover:text-purple transition-colors hidden sm:inline">
            Calculator
          </Link>
          <a href={NEWSLETTER_URL} className="hover:text-purple transition-colors hidden sm:inline">
            Newsletter
          </a>
          <a href={COMMUNITY_URL} className="hover:text-purple transition-colors hidden md:inline">
            Community
          </a>
          <Link href="/login" className="text-purple hover:underline">
            Sign in
          </Link>
        </nav>
      </header>

      {/* ——— Hero ——— */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
        <div className="lg:col-span-7">
          <p className="rise text-sm tracking-wide text-purple mb-5" style={{ animationDelay: "0ms" }}>
            A mathematical system, not investment tips
          </p>
          <h1
            className="rise text-[2.6rem] leading-[1.08] sm:text-6xl sm:leading-[1.05]"
            style={{ animationDelay: "80ms" }}
          >
            You&apos;re already saving.
            <br />
            That was the hard part.
          </h1>
          <p
            className="rise mt-7 max-w-xl text-base sm:text-lg text-sub leading-relaxed"
            style={{ animationDelay: "180ms" }}
          >
            Amplifica Wealth is a scalable system for turning consistent savings into
            monthly investment income. Draw on a line of credit, fund an income
            investment, let its payments and your savings clear the line, then deploy
            again, larger.
          </p>
          <div className="rise mt-9 flex flex-wrap items-center gap-6" style={{ animationDelay: "280ms" }}>
            <Link
              href="/calculator"
              className="bg-purple hover:bg-purple/90 transition-colors text-white px-6 py-3 rounded text-sm"
            >
              Find your optionality date
            </Link>
            <a href={NEWSLETTER_URL} className="text-sm text-purple hover:underline">
              Read the weekly letter
            </a>
          </div>
          <p className="rise mt-5 text-xs text-sub" style={{ animationDelay: "360ms" }}>
            Both free. No promised returns, ever.
          </p>
        </div>
        <div className="lg:col-span-5 hidden lg:flex justify-end">
          <AmplitudeField />
        </div>
      </section>

      {/* ——— The cycle ——— */}
      <section className="border-y border-edge bg-card">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <p className="font-display text-2xl sm:text-3xl max-w-2xl">
            Most people spend a dollar once.{" "}
            <span className="text-purple">Ours do three jobs before they rest.</span>
          </p>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-10">
            {cycle.map((c, i) => (
              <div key={c.step} className={i % 2 === 1 ? "lg:mt-8" : ""}>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-aqua text-lg tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-lg">{c.step}</h2>
                </div>
                <p className="mt-2 text-sm text-sub leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ——— The ledger ——— */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <h2 className="text-2xl sm:text-3xl leading-snug">
              What the math says, and what it doesn&apos;t.
            </h2>
            <p className="mt-4 text-sm text-sub leading-relaxed">
              One benchmark: a $2,000 monthly contribution, investments amortizing at
              8%, a line of credit costing 10%. These are model outputs under fixed
              assumptions. They describe the model, not your account, and we promise
              no return.
            </p>
            <Link
              href="/calculator"
              className="mt-5 inline-block text-sm text-purple hover:underline"
            >
              See the power of the Amplification Methodology
            </Link>
          </div>
          <dl className="lg:col-span-7 lg:col-start-6 divide-y divide-edge">
            <div className="py-6 flex items-baseline justify-between gap-6 flex-wrap">
              <dt className="text-sm text-sub max-w-sm">
                System cash flow (investment payments alone, excluding your
                contribution) first crosses $45,000 a month
              </dt>
              <dd className="font-display text-3xl tabular-nums">~15 yrs</dd>
            </div>
            <div className="py-6 flex items-baseline justify-between gap-6 flex-wrap">
              <dt className="text-sm text-sub max-w-sm">
                With short terms, stop contributing at year ten and the system
                sustains itself. Cash flow keeps compounding on its own
              </dt>
              <dd className="font-display text-3xl tabular-nums text-aqua">Year 10</dd>
            </div>
            <div className="py-6 flex items-baseline justify-between gap-6 flex-wrap">
              <dt className="text-sm text-sub max-w-sm">
                With optimization on short term investments, strategic deployments of
                long term investments or line of credit improvements, financial
                optionality is reached
              </dt>
              <dd className="font-display text-3xl tabular-nums text-purple">5–9 yrs</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ——— For / not for ——— */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          <div>
            <h2 className="text-xl mb-5">Built for you if</h2>
            <ul className="space-y-3 text-sm leading-relaxed">
              <li className="flex gap-3"><span className="text-aqua">—</span> You have stable income and save consistently, around $1,000 a month.</li>
              <li className="flex gap-3"><span className="text-aqua">—</span> Your money sits in savings or index funds and feels like it&apos;s underperforming.</li>
              <li className="flex gap-3"><span className="text-aqua">—</span> You want a system you run yourself, with the math shown at every step.</li>
              <li className="flex gap-3"><span className="text-aqua">—</span> You want freedom more than a bigger number.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xl mb-5 text-sub">Not for you if</h2>
            <ul className="space-y-3 text-sm leading-relaxed text-sub">
              <li className="flex gap-3"><span>—</span> Your income is unstable, or your credit is in bad shape.</li>
              <li className="flex gap-3"><span>—</span> You&apos;re chasing a promised return. We never make one.</li>
              <li className="flex gap-3"><span>—</span> You want someone to do it for you. This is a skill, not a service.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ——— The honesty block ——— */}
      <section className="bg-plum text-[#F6F1EA]">
        <div className="max-w-6xl mx-auto px-6 py-24 sm:py-28">
          <h2 className="font-display text-3xl sm:text-5xl leading-tight max-w-3xl">
            We&apos;re not financially free yet.
          </h2>
          <div className="mt-8 max-w-2xl space-y-4 text-[#F6F1EA]/80 text-base leading-relaxed">
            <p>
              Miguel has lost over a million dollars, twice: once to a custodian
              bankruptcy, once to a business he bought and had to close. Jackie, a
              trained scientist, was laid off three months into his first industry
              role. We built this system from those lessons, taking control of our
              finances and lives.
            </p>
            <p>
              We&apos;re peers walking ahead on the same road, reporting back with real
              numbers, wins and expensive lessons included. When we&apos;re still
              testing something, we say so. Between an astrophysicist and a PhD, we
              also know how to test a model before we trust it.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <a
              href={COMMUNITY_URL}
              className="bg-[#F6F1EA] text-plum hover:bg-white transition-colors px-6 py-3 rounded text-sm"
            >
              Join the community
            </a>
          </div>
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer className="border-t border-edge">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="text-sm">
              Engineer your future. Amplify your wealth. Live your way.
            </span>
            <nav className="flex gap-6 text-sm text-sub">
              <Link href="/calculator" className="hover:text-purple">Calculator</Link>
              <a href={NEWSLETTER_URL} className="hover:text-purple">Newsletter</a>
              <a href={COMMUNITY_URL} className="hover:text-purple">Community</a>
              <Link href="/login" className="hover:text-purple">Sign in</Link>
            </nav>
          </div>
          <p className="text-xs text-sub max-w-3xl">
            © 2026 Amplifica Wealth. Educational publisher, not a registered
            investment adviser. Nothing here is financial, legal, or tax advice, and
            no return is promised or implied. Borrowing to invest involves real risk,
            including the loss of borrowed principal.
          </p>
        </div>
      </footer>
    </div>
  );
}
