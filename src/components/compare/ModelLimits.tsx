"use client";

// Collapsed by default. Everything here is a real limit on the numbers above,
// not boilerplate.
const LIMITS = [
  "No AMT, no self-employment tax, and no NOL carryback.",
  "State tax is a flat rate on all income, with no brackets and no separate treatment of capital gains.",
  "QBI (§199A) is defined but inert — no option produces QBI-eligible income yet.",
  "Tax constants are tax year 2025 (Rev. Proc. 2024-40, standard deduction per P.L. 119-21) and are indexed forward by the inflation rate. Re-verify for any other year.",
  "A non-passive loss left unused at month 84 is reported, not released — it carries forward in life, and this model stops at seven years.",
  "The exit is valued as of month 83 but discounted as though received at month 84, which understates accruing options by roughly 7-16 basis points.",
  "Three options are not modelled at all: commercial real estate, business investment, and oil & gas.",
  "Rental operating expenses are a share of post-vacancy rent and grow continuously rather than in annual lease steps — both assumptions flatter the rental.",
];

export default function ModelLimits() {
  return (
    <details className="bg-card border border-edge rounded-lg p-4 mb-4">
      <summary className="cursor-pointer font-semibold text-sm">
        What this model does not do
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-sub list-disc pl-5">
        {LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-sub">
        This is a modelling tool, not tax advice. The figures are estimates from
        stated assumptions, and no part of this is a recommendation to buy,
        sell, or hold anything. Confirm any of it with your own CPA before
        acting on it.
      </p>
    </details>
  );
}
