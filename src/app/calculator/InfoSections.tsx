import Link from "next/link";

// Server-rendered content below the calculator/gate. Always visible to
// visitors and crawlers regardless of unlock state — this is the page's
// rankable, citable substance. The FAQ array drives both the visible section
// and the FAQPage JSON-LD so the markup can never drift from the page.

const LAST_UPDATED = "July 2026";

const faqs = [
  {
    q: "What is financial optionality?",
    a: "Financial optionality is the point where the monthly cash flow from your investments can cover your target monthly income without eroding the value of your remaining future payments. Work becomes a choice rather than a requirement. This calculator estimates the date that happens for your numbers.",
  },
  {
    q: "How is this different from a FIRE or 4% rule calculator?",
    a: "FIRE calculators answer \"when have I accumulated 25 times my expenses, so I can sell about 4% per year?\" This calculator answers a different question: when does the monthly income from your investments cover your target spending on its own? It models cash flow month by month instead of a withdrawal rate on a lump sum.",
  },
  {
    q: "What is an Amplicon?",
    a: "An Amplicon is our name for one income investment in the cycle: an amortized investment that pays a level monthly amount over a fixed term, like a loan you own the receiving side of. Each completed payoff funds the next, larger deployment. That repeating cycle is the amplification.",
  },
  {
    q: "How does the flywheel work?",
    a: "Deploy, collect, repay, repeat. You draw on a line of credit to fund an income investment. The investment's monthly payments, plus your own monthly savings, pay the line back down. When the line is effectively clear, you deploy again at a larger size. The calculator simulates this loop for every month of the horizon.",
  },
  {
    q: "Do I need a HELOC to use this strategy?",
    a: "No. The model works with any line of credit: a HELOC, a personal or unsecured line, or other revolving credit you can draw and repay. The calculator only needs the line's interest rate and your starting deployment size. What matters is the spread between what the investment pays and what the borrowed capital costs.",
  },
  {
    q: "Is borrowing to invest risky?",
    a: "Yes. The spread between investment return and borrowing cost can invert, credit lines can be repriced or frozen, and income investments can default or pay late. This calculator does not hide that: it shows peak debt alongside the upside, and the model deliberately avoids the accounting tricks that make similar strategies look faster than they are. Never model money you could not repay from your income.",
  },
  {
    q: "What assumptions does the calculator make?",
    a: "You set the inputs: monthly contribution, investment return, term length, and line-of-credit rate. The engine then applies plain amortization math with conservative accounting: capital is conserved exactly, nothing is written off, and no return is ever assumed beyond the rate you typed in. The engine reports totals in nominal dollars, so the optionality date is a more robust output than the far-future dollar magnitudes.",
  },
  {
    q: "Is this financial advice?",
    a: "No. The calculator is an educational model of one strategy under assumptions you choose. It is not a recommendation to borrow or to buy any investment, and its outputs are not predictions of any real account. Talk to a licensed professional about your own situation.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const appSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Amplifica Financial Optionality Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free calculator that simulates turning monthly savings and a line of credit into monthly investment income, and estimates your financial optionality date.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function InfoSections() {
  return (
    <div className="max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
      />

      <Section title="What this calculator does">
        <p className="text-sm leading-relaxed">
          It simulates a cash-flow system month by month. You contribute a fixed monthly
          savings amount, draw on a line of credit to fund an amortized income
          investment, and the investment&apos;s payments plus your savings repay the line.
          Each payoff funds a larger deployment. The calculator reports when the
          system&apos;s own cash flow could cover your target monthly income (your
          financial optionality date) and, separately, when you could stop
          contributing and let the system sustain itself.
        </p>
      </Section>

      <Section title="How it compares to a typical FIRE calculator">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-edge rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-card text-left">
                <th className="p-3 font-semibold"></th>
                <th className="p-3 font-semibold">Typical FIRE calculator</th>
                <th className="p-3 font-semibold">This calculator</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-edge">
                <td className="p-3 text-sub">Goal</td>
                <td className="p-3">Accumulate ~25× annual expenses</td>
                <td className="p-3">Build monthly cash flow that covers expenses</td>
              </tr>
              <tr className="border-t border-edge">
                <td className="p-3 text-sub">Math</td>
                <td className="p-3">Savings rate + market return + 4% withdrawal</td>
                <td className="p-3">Month-by-month amortization ledger</td>
              </tr>
              <tr className="border-t border-edge">
                <td className="p-3 text-sub">&quot;Done&quot; means</td>
                <td className="p-3">Selling assets at a safe rate</td>
                <td className="p-3">Income arriving monthly without eroding the base</td>
              </tr>
              <tr className="border-t border-edge">
                <td className="p-3 text-sub">Risk shown</td>
                <td className="p-3">Sequence-of-returns, usually implicit</td>
                <td className="p-3">Peak debt, displayed explicitly</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What the model shows: a benchmark scenario">
        <p className="text-sm leading-relaxed mb-3">
          These are model outputs under one fixed set of assumptions: a $2,000
          monthly contribution, investments amortizing at 8%, a line of credit
          costing 10%, and the calculator&apos;s defaults otherwise. They describe the
          model, not your account, and we promise no return.
        </p>
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-2">
          <li>
            The system&apos;s own cash flow (investment payments only, excluding the
            contribution) first crosses $45,000 per month at roughly 15 years, month
            179 of the simulation.
          </li>
          <li>
            Term length sets the pace. Shortening investment terms from 36 to 24
            months moves that same milestone to roughly 10.7 years (month 128), while
            deployment size step-ups barely move the date.
          </li>
          <li>
            With 24-month terms, stopping the contribution at year 10 leaves a
            self-sustaining system: expected future payments never erode and cash
            flow keeps compounding on its own.
          </li>
          <li>
            Aggressive &quot;always step up&quot; configurations look years faster early and
            then collapse, which is why the engine gates each deployment on a
            predicted payoff instead of optimism.
          </li>
        </ul>
      </Section>

      <Section title="Methodology">
        <p className="text-sm leading-relaxed mb-3">
          The engine is standard amortization mathematics run as a monthly ledger:
          accrue interest on the line&apos;s balance, collect every active investment&apos;s
          payment, apply inflows against the line, and redeploy only when the next
          investment&apos;s payoff is predicted within the configured window. Three
          properties matter:
        </p>
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-2">
          <li>
            <strong>Capital is conserved exactly.</strong> Nothing is written off and
            no &quot;free capital&quot; appears between cycles. We rejected a common modeling
            shortcut in this space that silently credits unearned capital at every
            redeploy, because it overstates the strategy&apos;s speed by years.
          </li>
          <li>
            <strong>The engine is tested.</strong> Over 70 automated tests pin its
            behavior, including invariants that prove conservation of capital at a 0%
            interest rate.
          </li>
          <li>
            <strong>Accounting is nominal and we say so.</strong> Asset values are the
            sum of remaining future payments, undiscounted. That makes far-future
            dollar totals optimistic, so treat the <em>date</em> outputs as the robust
            result, a limitation most calculators in this category do not disclose.
          </li>
        </ul>
      </Section>

      <Section title="Frequently asked questions">
        <div className="space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-sm font-semibold mb-1">{f.q}</h3>
              <p className="text-sm text-sub leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Who built this">
        <p className="text-sm leading-relaxed">
          Amplifica Wealth was founded by <strong>Miguel Graf</strong> and{" "}
          <strong>Jackie Tang</strong>. Miguel has lost over a million dollars, twice:
          once to a custodian bankruptcy, once to a business he bought and had to
          close. He built this system, and this calculator, from what those losses
          taught him. Neither founder is financially free yet; they are ahead on the
          same road, reporting real numbers as they go. They cover the strategy, with
          the actual figures behind it, weekly in the{" "}
          <a
            href="https://amplifica-wealth.beehiiv.com"
            className="text-purple hover:underline"
          >
            Amplifica Wealth newsletter
          </a>
          .
        </p>
      </Section>

      <div className="mt-10 pt-4 border-t border-edge text-xs text-sub space-y-2">
        <p>Last updated: {LAST_UPDATED}</p>
        <p>
          Amplifica Wealth is an educational publisher, not a registered investment
          adviser. Nothing on this page is financial, legal, or tax advice, and no
          return is promised or implied. Borrowing to invest involves real risk,
          including the loss of borrowed principal.{" "}
          <Link href="/signup" className="text-purple hover:underline">
            Create a free account
          </Link>{" "}
          to model your own numbers in full.
        </p>
      </div>
    </div>
  );
}
