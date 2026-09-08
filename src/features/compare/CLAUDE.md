# features/compare — the investment comparison engine

Puts several investment options on the same footing over an 84-month horizon and
reports what each actually returns after tax.

**Full status doc:** `docs/superpowers/investment-comparison-STATUS.md`.
It predates the restructure, so its `src/lib/compare/**` paths now mean
`src/features/compare/engine/**`.

## The load-bearing idea

`engine/run.ts` is the orchestrator, and every option travels the **same five
stages in the same order**:

```
build → escalate (inflation) → sleeve → tax → deflate
```

That order is what makes the comparison structurally fair rather than a
discipline someone has to maintain. It has one consequence you must not break:

> **Builders emit PRE-TAX series in their own entryBasis and know nothing about
> tax or inflation.** Those layers run once, downstream, identically for every
> option.

A builder that imports from `tax/` or `inflation.ts` would compile, pass its own
unit tests, and quietly produce a number that is not comparable to the
others. `engine/builders/layering.test.ts` reads the source to catch exactly
that. Do not weaken it.

## Layout

| Path | What |
|---|---|
| `engine/run.ts` | The orchestrator. `runComparison()` is the entry point. |
| `engine/types.ts` | `HORIZON_MONTHS = 84`, the series and tax-profile shapes. |
| `engine/builders/` | Six option builders (cash, rental, flywheel, index fund, dividend, debt paydown) plus three support modules: `sleeve`, `depreciation`, `cash-account`. Pre-tax only. |
| `engine/builders/sleeve.ts` | The capital contract: every option consumes the whole schedule; what it does not absorb sits idle in the sleeve. |
| `engine/tax/` | Brackets, NIIT/QBI surtaxes, passive-loss rules, exit tax. |
| `engine/metrics.ts` | IRR and the derived per-option metrics. |
| `engine/present.ts` | Pure presentation: `METRIC_ROWS`, formatting, best-of-row. No React. |
| `engine/defaults.ts` | `DEFAULT_GLOBALS`, `DEFAULT_SPECS`, `UNBUILT_OPTIONS`. |
| `ui/` | `CompareClient` is the root; the rest are controlled inputs and the table. |

## Reading order

`engine/types.ts` → `engine/run.ts` → whichever builder you need. Skip
`*.test.ts` unless you are changing behavior: 31 of the 50 files here are
tests, and they are 4.4k of the folder's 6.9k lines. Several are golden or
invariant suites that are long by design.

## Gotchas

- `/compare` is **live but unlinked and private** — inside the authed `(app)`
  group, disallowed in robots, absent from the sitemap, not in the Sidebar.
  `src/app/compare-route.test.ts` asserts all four; if you link it, that test is
  the thing to update deliberately.
- Exit tax is held separate from operating tax (`exitTaxPaid` vs `taxPaid`).
  Summing `taxPaid` alone can flatter an option that pays heavily on sale.
- `residual*` fields are **reported, never monetized**.
