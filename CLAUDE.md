# amplifica — repo map

Next.js 14 App Router + Supabase. A flywheel-investing simulator, a public
email-gated calculator, CRUD for the user's Amplicons and lines of credit, and
an investment-comparison engine.

**Start here:** `docs/PRODUCT-STATUS.md` is the full product and data-model
reference. This file is only about where code lives.

## The three rules

Enforced by `src/boundaries.test.ts`, not by discipline:

1. `app/` may import from `features/` and `shared/`. **Nothing imports `app/`.**
2. `features/X` may import from `shared/`, and from a feature in that test's
   `SHARED_FEATURES` allowlist (today: `simulator`). Not from other features.
3. `shared/` may import only from `shared/`.

`shared/` membership follows the import graph: a module two or more features use
belongs there. That is why the finance engine is `shared/` and `compare/` is a
feature.

## Where to point yourself

Read the CLAUDE.md in a folder that has one before reading its code. Tests sit
beside their source — **read `*.ts` first, and open `*.test.ts` only when
changing behavior.** In `compare/engine/` 31 of 50 files are tests; in
`shared/finance/`, 10 of 17.

| Task | Read | Files |
|---|---|---|
| Comparison math | `src/features/compare/engine/` | 50 (2.5k lines excl. tests) |
| Comparison UI | `src/features/compare/ui/` | 11 |
| Flywheel projection math | `src/shared/finance/` | 17 (0.9k lines excl. tests) |
| Simulator UI (both surfaces) | `src/features/simulator/` | 6 |
| A CRUD screen | `src/features/{amplicons,loc}/` | 3-5 each |
| Auth | `src/features/auth/data/` + `src/shared/supabase/` | ~8 |
| Anything routing | `src/app/` | — |

## The small features

| Feature | What it is |
|---|---|
| `amplicons/` | CRUD for amortized investments. `data/actions.ts` + two UI files. |
| `loc/` | CRUD for lines of credit. `updateUtilization` deliberately has no user check — it leans on RLS. |
| `dashboard/` | One chart component; the page does the querying. |
| `settings/` | Profile goals + theme toggle. |
| `projections/` | Thin composition over `features/simulator`; `data/actions.ts` owns the FormData contract that `SimInputsGrid`'s `name=` attributes must match. |
| `calculator/` | Public email-gated simulator. `data/actions.ts` writes leads via the **service-role** client and subscribes to Beehiiv. |
| `amortization/` | A loan calculator that is **removable in one delete**: nothing outside the folder imports it, apart from `nav.ts` in the Sidebar. |
| `auth/` | login / signup / reset-password server actions. |

## Conventions

- **Mutations are Server Actions.** No client-side DB calls, ever.
- **`requireUser()`** (`shared/supabase/auth.ts`) opens every protected page and
  action. Two callers deliberately opt out; that file names them.
- **`shared/forms.ts`** reads FormData. Note the documented quirk: the fallback
  applies only when a field is *absent*, so a cleared box yields 0.
- **RLS is the real security boundary.** Writes are additionally scoped
  `.eq("user_id", user.id)` as defense in depth, never instead of it.
- `pnpm test` (Vitest), `pnpm typecheck`, `pnpm build`.
