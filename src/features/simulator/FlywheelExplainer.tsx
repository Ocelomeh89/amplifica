"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

function Formula({ children }: { children: string }) {
  return (
    <pre className="bg-edge rounded p-3 text-[11px] leading-relaxed font-mono text-ink whitespace-pre-wrap overflow-x-auto">
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] uppercase tracking-wide text-sub font-semibold mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

export default function FlywheelExplainer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink transition-colors">
        <Info className="w-3.5 h-3.5" /> How the flywheel works
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="How the flywheel works">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold">How the flywheel works</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sub hover:text-ink" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <Section title="Each month">
              <p className="text-sm text-sub leading-relaxed">
                {`The engine accrues interest on the line of credit, collects cash (your savings plus the monthly payout of every active investment), and uses it to pay the balance down. Any surplus beyond what's needed to clear the balance is banked in a cash bucket — never discarded. When the remaining balance drops below one month's payment, the line is effectively clear: the engine redeploys, rolling the small leftover into the new draw (it stays owed — nothing is written off) — but only if that new draw is itself predicted to clear within 4 months. It tries the stepped-up size first, then the current size; if neither qualifies, it waits and banks cash until one does.`}
              </p>
              <p className="text-sm text-sub leading-relaxed mt-2">
                {`Each investment — the first one included — is drawn one month before it starts paying: the opening draw is taken in month 0, and its first payment lands in month 1. So month 0 sees your savings only.`}
              </p>
            </Section>

            <Section title="Sizing rule (steps up on fast payoff)">
              <Formula>{`Initial investment size = MSC × InvestmentSizeFactor

When a loan cleared in FEWER than 4 months AND the
stepped-up draw is predicted to clear within 4 months:
    investment size × LineOfCreditIncrease
Otherwise the investment size stays the same.`}</Formula>
              <p className="text-sm text-sub leading-relaxed mt-2">
                {`Redeploying the moment the line is nearly clear (and deploying the cash bucket against each new draw) keeps cycles short, so the upgrade fires often and the investment size compounds — but never faster than the returns can actually pay for, because every draw must pass the under-4-months prediction first.`}
              </p>
            </Section>

            <Section title="Investment size (expected future payments)">
              <p className="text-sm text-sub leading-relaxed">
                {`Investment size = the nominal sum of all remaining investment payments, PLUS the cash bucket, minus the outstanding line-of-credit balance. It is future cash measured at face value — not a discounted present value — so there is no discount-rate assumption to argue about. Banking surplus cash (rather than discarding it) is what lets your monthly savings keep adding to the total over time.`}
              </p>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
