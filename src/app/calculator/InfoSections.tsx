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
    q: "How does the Amplification Method work?",
    a: "Deploy, collect, repay, repeat. You draw on a line of credit to fund an income investment. The investment's monthly payments, plus your own monthly savings, pay the line back down. When the line is effectively clear, you deploy again at a larger size. The calculator simulates this loop for every month of the horizon.",
  },
  {
    q: "What is an Amplicon?",
    a: "An Amplicon is our name for one investment cycle. These can be short term or long term. For example, an amortized investment that pays a level monthly amount over a fixed term (36 months), like a loan you own the receiving side of. Each completed payoff funds the next, larger deployment. That repeating cycle is the amplification.",
  },
  {
    q: "Do I need a HELOC to use this strategy?",
    a: "No. The model works with any line of credit: a HELOC, a personal or unsecured line, or other revolving credit you can draw and repay. The calculator only needs the line's interest rate and your starting deployment size. What matters is the spread between what the investment pays and what the borrowed capital costs.",
  },
  {
    q: "Is borrowing to invest risky?",
    a: "The Amplification Method limits risk by never borrowing more than can be repaid within 4-6 months. While borrowing always involves a higher level of risk, this guidance ensures that in an adverse financial life event, the leverage remains manageable.",
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
          costing 10%, and the calculator&apos;s defaults otherwise. Actual returns
          based on your investment choices and consistency. No guaranteed returns.
        </p>
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-2">
          <li>
            The system&apos;s own cash flow (investment payments only, excluding the
            contribution) first crosses $45,000 per month at roughly 15 years, month
            179 of the simulation.
          </li>
          <li>
            Boost, such as reducing term length from 36 to 24 months, move the same
            milestone to 10 years and under.
          </li>
          <li>
            With 24-month terms, stopping the contribution at year 10 leaves a
            self-sustaining system: expected future payments never erode and cash
            flow keeps compounding on its own.
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
          <strong>Jackie Tang</strong>. Miguel&apos;s 15 years in financial risk
          management and Jackie&apos;s PhD in cancer biology are the engine behind the
          calculator and method. Both founders built this to be tested, falsifiable
          and empirically used. They share their own real numbers and portfolios, not
          theories. They also cover the strategy, with the actual figures behind it,
          weekly in the{" "}
          <a
            href="/newsletter"
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
          including the loss of borrowed principal.
        </p>
      </div>
    </div>
  );
}
