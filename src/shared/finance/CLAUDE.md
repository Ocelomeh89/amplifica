# shared/finance — the pure engine

The flywheel projection math. **No I/O, no React, no Supabase** — plain
functions over plain numbers, which is why it is the most heavily tested part of
the app.

It is in `shared/` because four different places use it: the amortization page,
the dashboard, `features/simulator`, and three of the `compare` builders.

**Model spec:** `docs/PRODUCT-STATUS.md` §5–6 describes the simulation in
detail. Read that before changing behavior.

| File | What |
|---|---|
| `projection-sim.ts` | The flywheel simulation. `runSimulation()` is the entry point. |
| `sim-input.ts` | Its input shape and validation. |
| `sim-book.ts` | The book of launches the simulation carries month to month. |
| `projection.ts` | The simpler net-worth / cash-flow projection used by the dashboard. |
| `projection-fi.ts` | `earliestSustainableWithdrawal` — the "financial optionality" month. |
| `amortization.ts` | Payment, schedule, remaining principal. Used by the loan calculator and two compare builders. |
| `dates.ts` | Month-key helpers. |

## Rules

- **Keep it pure.** Anything that reaches for a client, a cookie or a component
  belongs in a feature, not here. Rule 3 in `src/boundaries.test.ts` enforces the
  import half of this.
- **The golden and invariant suites are the specification.**
  `*.golden.test.ts` pins known-good output; `*.invariants.test.ts` states
  properties that must hold for any input. If a change makes one fail, the
  question is whether the model changed on purpose — not how to make the test
  pass.
- Callers run this in-memory on the client (`useMemo`, debounced), so keep it
  cheap and allocation-light over an 84-month horizon.
