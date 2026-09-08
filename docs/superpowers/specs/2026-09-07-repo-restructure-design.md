# Repo restructure — feature folders, layered inside

**Date:** 2026-09-07
**Status:** approved, in progress
**Goal:** a folder structure that lets an LLM be pointed at one small, complete
part of the codebase. Net neutral on functionality.

---

## 1. Why

The tree is layer-first (`app/` `components/` `lib/`), so every domain is
smeared across three places. "Work on the comparison tool" today means reading
`src/lib/compare/` (42 files) plus `src/components/compare/` (11 files) plus a
route, and a naive `src/lib/**` glob drags in the unrelated finance kernel too.

The code itself is in good shape — 14.4k lines in `src/`, largest file 383
lines, no duplication of substance (see §6). The problem is **locatability**,
not quality. So this is overwhelmingly a move-files exercise, plus the docs that
tell an LLM which folder to open.

## 2. The rule

Three rules, enforced by a test (§5) rather than by discipline:

1. **`app/`** may import from `features/` and `shared/`. **Nothing may import
   from `app/`.** It holds routes and the route-group shell.
2. **`features/X`** may import from `shared/`, and from a declared shared
   feature. It may not import another feature.
3. **`shared/`** may import only from `shared/`.

`shared/` membership is decided by the import graph, not by feel: a module used
by two or more features is shared. Applying that mechanically produced two
findings that drove the design:

- **`lib/finance/` is not a feature.** It is the kernel — consumed by the
  amortization page, the dashboard, the simulator UI, and by three `compare/`
  builders. It becomes `shared/finance/`.
- **`lib/compare/` is a feature.** Only `components/compare/` imports it.

### The one declared exception

`simulator/` is UI shared by exactly two features (projections, calculator).
By the membership rule it would be `shared/`, but it is feature-shaped, so it
stays `features/simulator/` and the boundary test carries an explicit
allowlist:

```ts
const SHARED_FEATURES = ["simulator"];
```

One documented exception that fails loudly if a second one is ever added,
rather than a blanket rule nobody can enforce.

## 3. Target tree

```
src/
  app/                        # routes + route-group shell. Nothing imports this.
    (app)/ layout.tsx Sidebar.tsx
           dashboard/ amplicons/ loc/ projections/ settings/
           amortization/ compare/
    calculator/ login/ signup/ reset-password/ auth/callback/
    layout.tsx page.tsx globals.css robots.ts sitemap.ts
    compare-route.test.ts

  features/
    compare/       engine/ (+ builders/ tax/)  ui/   CLAUDE.md
    simulator/     useSimulation sim-values SimInputsGrid SimResults
                   SimCharts FlywheelExplainer          CLAUDE.md
    projections/   ui/ data/
    calculator/    ui/ data/ (actions, beehiiv)
    amortization/  engine/ ui/ nav.ts
    amplicons/     ui/ data/
    loc/           ui/ data/
    dashboard/     ui/
    settings/      ui/ data/
    auth/          data/ (login, signup, reset-password)

  shared/
    finance/       projection projection-sim projection-fi sim-book
                   sim-input amortization dates            CLAUDE.md
    ui/            Card Field InfoBox NumberInput PasswordInput
    supabase/      server admin middleware database.types
    format.ts  links.ts
```

Context sizes this buys:

| Point the LLM at | Files | ~Lines |
|---|---|---|
| `features/compare/engine/` | 42 | ~4.4k (2.2k excl. tests) |
| `features/compare/ui/` | 11 | ~1.3k |
| `shared/finance/` | 17 | ~2.3k |
| `features/loc/` | 4 | ~250 |

### Decisions

- **`@/` stays the only alias.** `@/shared/finance/projection` and
  `@/features/compare/engine/run` already read as boundaries; adding
  `@shared`/`@features` would mean two more config files for no gain.
- **Tests stay colocated.** 47 files, zero import churn, and the Vitest
  default. Context is managed by CLAUDE.md instead (§7).
- **`Sidebar.tsx` moves to `app/(app)/`.** It today imports `app/login/actions`
  and `app/(app)/amortization/nav` — a shared component reaching into routes,
  the exact inversion rule 1 forbids. It has one consumer
  (`app/(app)/layout.tsx`), so moving it into the route group makes both
  imports legal (app → feature) in a single move.
- **`lib/supabase/client.ts` is deleted.** The browser client has zero
  importers. Confirmed with the owner.

## 4. Phase 1 — moves only

`git mv` every file per the map, rewrite imports, nothing else. Provably
net-neutral: the suite must report the **same 47 files / 532 tests passing**
that it does today, with no test edited except the path constants in §5.

The `compare/build/` → `engine/builders/` rename lands here rather than in
Phase 2, because it is a move like any other. It also lets `.gitignore` drop the
`!src/lib/compare/build/` negation it currently needs to stop its `build/` rule
from matching source.

Gate: `pnpm typecheck && pnpm test && pnpm build`.

### The landmine

Two tests read source off disk by hardcoded path and break on any move:

- `src/app/compare-route.test.ts` — `src/app/(app)/layout.tsx`,
  `src/app/(app)/compare/page.tsx`, `src/components/Sidebar.tsx`
- `src/lib/compare/build/layering.test.ts` — `readdirSync` over `build/`

These are the codebase's existing architecture guard and the reason this
restructure is safe to attempt. Their path constants are updated in the same
commit as the move.

## 5. Phase 1b — the boundary test

`layering.test.ts` today enforces one rule (builders may not import tax or
inflation). It is extended to enforce the three rules of §2 across the whole
tree, keeping its existing assertions.

This is the piece that makes the structure self-healing: an LLM that reaches
from `features/loc` into `features/compare` fails CI instead of quietly
re-tangling the tree. Test-only, so still net-neutral.

## 6. Phase 2 — dedupes

Duplication was probed for and mostly **not found**.
`app/(app)/amortization/schedule.ts` already delegates to the shared lib;
`NumberField` carries a comment explaining why it is not `NumberInput`;
formatters are centralized with three stray `toFixed` calls. Expect
**~100–150 lines removed**, not a windfall. One commit each, independently
revertable.

| # | Change | Sites |
|---|---|---|
| a | `requireUser()` in `shared/supabase/auth.ts` | ~12 of 15 |
| b | `shared/forms.ts`: `str()` / `num()` / `pct()` | 52 `formData.get()` in 8 files |
| c | `docs/PRODUCT-STATUS.md` §3 rewrite | 1 doc |

**(a) caveats — behavior must not change.** `loc/actions.ts::updateUtilization`
deliberately omits the user check and relies on RLS; `app/page.tsx` redirects
the *authenticated* user, not the anonymous one. Both keep current behavior and
are excluded from the helper.

**(b)** `pct()` captures the `/100` that repeats across action files, and the
helpers close a silent-NaN class where an emptied field yields `NaN`.

**(c)** the §3 directory map is stale — it omits `lib/compare/` and
`components/compare/` entirely, so the newest 42-file subsystem is invisible to
any LLM reading the docs. This is the highest-leverage doc fix in the plan.

## 7. Phase 3 — CLAUDE.md

~30 lines per feature and in `shared/finance/`: what it is, entry point, what it
depends on, what depends on it, its invariants, and *"read `*.ts` first; open
`*.test.ts` only when changing behavior."* Plus a root repo map.

The folder structure makes a small context possible; these files make an LLM
use it.

## 8. Out of scope

- No behavior changes, no dependency changes, no schema changes.
- `src/app/page.tsx` (319 lines, the landing page) is not decomposed — it is a
  route file and splitting it serves no stated goal.
- Stale untracked root artifacts (`dist/`, `vite.config.js`, `vite.config.d.ts`,
  `*.tsbuildinfo`) are already gitignored; deleting them is local hygiene with
  no repo effect and is not part of this work.
