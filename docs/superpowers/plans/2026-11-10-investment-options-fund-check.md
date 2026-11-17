# Investment Options and Fund Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record their real investment options, say where each Amplicon's face value went, record moves and value check-ins, and see a warning beside the dashboard projection when the fund can't cover the Amplicon payments.

**Architecture:** A new pure module, `src/shared/finance/fund-check.ts`, replays the fund month by month from the tracked Amplicons and returns a status. A new feature, `src/features/investments/`, owns the CRUD, the loader, the `/investment-options` page and the dashboard card. The Amplicon form gains an "Invested in" section that receives the option list as a prop from `app/`, so no feature imports another.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-10-investment-options-fund-check-design.md`

**Workspace:** a git worktree on branch `feat/investment-options`, created with superpowers:using-git-worktrees at execution time. `main` has concurrent `/content` work: never switch the main checkout's branch. Move the spec and this plan (both untracked in the main checkout) into the worktree and commit them as the first commit.

## Global Constraints

- **Math guard:** no change to `src/shared/finance/{projection-sim,sim-input,sim-book,sim-ledger,projection,projection-fi,dashboard-seed,amortization}.ts`, `src/features/compare/engine/`, `src/features/dashboard/projection.ts` or `src/features/simulator/`. The fund check only reads Amplicon schedules through the existing `monthlyPayoutOf` / `isActiveAt`. The `*.golden.test.ts` and `*.invariants.test.ts` suites must pass unchanged at the end.
- Boundaries (`src/boundaries.test.ts`): `features/amplicons` must not import `features/investments`, and vice versa. Shared types live in `shared/finance/fund-check.ts`.
- Mutations are Server Actions that open with `requireUser()`. Writes are scoped `.eq("user_id", user.id)` on top of RLS. No client-side DB calls.
- Rates are stored as annual decimals (`numeric(7,6)`), and forms take whole percentage points (`pct()` from `shared/forms.ts`).
- Default growth is a code constant: id `"default-growth"`, appreciation, 10%, infinite term, liquid. In the DB, `null` option ids mean Default growth.
- Option edits look forward only: each edit is a version with `effective_month` = the month it was made.
- Splits: at most 3 rows, each pct > 0, no repeated option, summing to 100% (±0.01 percentage points). Empty means Default growth.
- Past months: an uncovered shortfall before the current month is never reported and never carried forward.
- Exact copy: "Can't cover this month." · "Runs out of liquid money in {Mon YYYY}." · "With this change, your fund runs out of liquid money in {Mon YYYY}." · "Save anyway" · "{n} Amplicon(s) assumed in Default growth (10%)".
- Migration file: `supabase/migrations/0019_investment_options.sql`. Before you create it, check that no `0019_*` has landed on `main`. If one has, take the next free number and use it everywhere this plan says 0019. It is applied by hand in the Supabase SQL editor, like 0008–0018.

## Review Focus

1. **An Amplicon with a start date in the future** deposits into the fund only in its launch month (start − 1). Before that, its payments aren't due and the warning must not count it. → test in Task 3.
2. **A move dated before the source holding exists** (or larger than its balance) is capped at what's there and listed in `cappedMoveIds`. It is never a negative balance. → test in Task 3.
3. **A check-in of 0 on the only liquid holding** makes the next uncovered month the run-out month. It doesn't crash on an empty lot list. → test in Task 3.
4. **Editing an option twice in the same month** updates that month's version instead of failing on the unique key. → test in Task 4.
5. **A split that sums to 99.995%** (rounding from the UI) is accepted. 99.9% is rejected. → test in Task 7.

---

### Task 1: Migration and DB types

**Files:**
- Create: `supabase/migrations/0019_investment_options.sql`
- Create: `supabase/migrations/0019_investment_options.test.ts`
- Modify: `src/shared/supabase/database.types.ts` (add five tables; export `InvestmentOptionRow`, `InvestmentOptionVersionRow`, `AmpliconAllocationRow`, `FundMoveRow`, `HoldingCheckinRow` aliases beside the existing ones)

**Interfaces:**
- Produces these tables, all with `user_id uuid not null references auth.users(id) on delete cascade`, `created_at`/`updated_at` plus the `touch_updated_at` trigger, RLS on, self select/insert/update/delete policies on `auth.uid() = user_id`, and an index on `user_id`:
  - `investment_options(id uuid pk, user_id, name text not null)`
  - `investment_option_versions(id uuid pk, user_id, option_id uuid not null → investment_options on delete cascade, effective_month date not null, option_type text not null check in ('amortized','interest_only','appreciation'), rate_pct numeric(7,6) not null check (rate_pct >= 0 and rate_pct <= 1), term_months integer null check (term_months is null or term_months > 0), liquid boolean not null, unique (option_id, effective_month))`
  - `amplicon_allocations(id uuid pk, user_id, amplicon_id uuid not null → amplicons on delete cascade, investment_option_id uuid not null → investment_options on delete restrict, pct numeric(5,4) not null check (pct > 0 and pct <= 1), unique (amplicon_id, investment_option_id))`
  - `fund_moves(id uuid pk, user_id, from_option_id uuid null → investment_options on delete restrict, to_option_id uuid null → investment_options on delete restrict, amount numeric(14,2) not null check (amount > 0), move_month date not null, check (from_option_id is distinct from to_option_id))`
  - `holding_checkins(id uuid pk, user_id, investment_option_id uuid null → investment_options on delete restrict, value numeric(14,2) not null check (value >= 0), checkin_month date not null)`

- [ ] **Step 1: Write the failing test** `0019_investment_options.test.ts`, modelled on `0012_dashboard_projection_settings.test.ts`:
  - `creates all five tables`: `/create table public\.(investment_options|investment_option_versions|amplicon_allocations|fund_moves|holding_checkins)/` matches 5 times.
  - `enables RLS on each and scopes every policy to the owner`: `enable row level security` × 5; `auth.uid() = user_id` × 20.
  - `protects options in use`: `investment_option_id uuid not null references public.investment_options(id) on delete restrict` is present; `from_option_id` and `to_option_id` are both `on delete restrict`.
  - `deletes a split with its Amplicon`: `amplicon_id uuid not null references public.amplicons(id) on delete cascade`.
  - `alters no existing table`: no `alter table public.(profiles|amplicons|locs|projections|dashboard_projection_settings)`.
- [ ] **Step 2:** Run `pnpm vitest run supabase/migrations/0019_investment_options.test.ts`. Expected: FAIL (file not found).
- [ ] **Step 3:** Write the SQL using the interfaces above. Write the policies four per table, in the style of 0012 plus a delete policy.
- [ ] **Step 4:** Add the five tables to `database.types.ts` (Row/Insert/Update, nullable ids as `string | null`, `option_type` as the literal union).
- [ ] **Step 5:** Run the test and `pnpm typecheck`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `feat(investments): schema for options, versions, splits, moves, check-ins`

### Task 2: Lot stepping and option terms

**Files:**
- Create: `src/shared/finance/fund-check.ts` (types and `termsAt`, `stepLot`)
- Create: `src/shared/finance/fund-check.lots.test.ts`

**Interfaces:**
- Produces (exported):
```ts
export type OptionType = "amortized" | "interest_only" | "appreciation";
export interface OptionTerms { optionType: OptionType; ratePct: number; termMonths: number | null; liquid: boolean }
export interface OptionVersion extends OptionTerms { effectiveMonth: YearMonth }
export interface FundOption { id: string; name: string; versions: OptionVersion[] } // any order
export const DEFAULT_GROWTH_ID = "default-growth";
export const DEFAULT_GROWTH: FundOption; // name "Default growth", one version effectiveMonth "0000-01", appreciation, 0.10, null, liquid
export interface Lot { principal: number; startMonth: YearMonth } // startMonth = deposit month
export function termsAt(option: FundOption, month: YearMonth): OptionTerms;
export function stepLot(lot: Lot, terms: OptionTerms, month: YearMonth): { cash: number; closed: boolean };
```
- `termsAt`: the version with the latest `effectiveMonth <= month`. If none is in effect yet, the earliest version.
- `stepLot` mutates `lot.principal`. With `k = monthsBetween(lot.startMonth, month)`, `k <= 0` is a no-op `{cash: 0, closed: false}`. Otherwise, with `r = ratePct / 12`:
  - **appreciation:** `principal *= 1 + r`, cash 0. If the term is finite and `k >= term`: cash = principal, principal 0, closed.
  - **interest_only:** cash = `principal * r`. If the term is finite and `k >= term`: also cash += principal, principal 0, closed.
  - **amortized, infinite term:** cash = `principal * r` (principal unchanged).
  - **amortized, finite term:** `n = term - k + 1`; `pay = monthlyPayment(principal, ratePct, n)`; `principal -= pay - principal * r`; cash = pay. Closed (principal 0) when `k >= term`. Re-solving the payment from the current principal and remaining term each month is deliberate: it equals the fixed schedule when nothing changes, and it handles version changes and check-in scaling.

- [ ] **Step 1: Write the failing tests**
  - `termsAt picks the latest version in effect`: versions at "2026-01" (rate 0.05) and "2026-06" (rate 0.08). `termsAt(o,"2026-05").ratePct === 0.05`; `termsAt(o,"2026-06").ratePct === 0.08`; `termsAt(o,"2025-12").ratePct === 0.05`.
  - `deposit month earns nothing`: `stepLot({principal:1000,startMonth:"2026-01"}, appr10, "2026-01")` → cash 0, principal 1000.
  - `amortized finite pays the standard payment and ends at zero`: a 12000 lot, 6%, 12-month term, stepped "2026-02".."2027-01". Every cash equals `monthlyPayment(12000, 0.06, 12)` to 1e-6, the last step has `closed` true, and the final principal is 0 (±1e-6).
  - `amortized infinite is interest only`: 12000 at 6%, infinite → cash 60, principal 12000.
  - `interest-only finite returns principal at term`: 10000 at 12%, 3-month term → cash 100, 100, 10100; closed on the third.
  - `appreciation compounds`: 1000 at 12%, two steps → principal 1020.1 (±1e-9), cash 0.
- [ ] **Step 2:** Run `pnpm vitest run src/shared/finance/fund-check.lots.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the types, `DEFAULT_GROWTH`, `termsAt` and `stepLot` in `fund-check.ts`. Import `monthlyPayment` from `./amortization` and the date helpers from `./dates`. Do not modify either.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(finance): fund-check lot stepping per option type`

### Task 3: `runFundCheck`

**Files:**
- Modify: `src/shared/finance/fund-check.ts`
- Create: `src/shared/finance/fund-check.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; `AmpliconLite`, `monthlyPayoutOf`, `isActiveAt` from `./projection`.
- Produces:
```ts
export interface Allocation { optionId: string; pct: number } // pct decimal
export interface FundAmplicon extends AmpliconLite { allocations: Allocation[] }
export interface FundMove { id: string; fromId: string; toId: string; amount: number; month: YearMonth } // DEFAULT_GROWTH_ID for null
export interface FundCheckin { optionId: string; value: number; month: YearMonth }
export interface FundCheckInput { amplicons: FundAmplicon[]; options: FundOption[]; moves: FundMove[]; checkins: FundCheckin[]; today: YearMonth }
export interface FundMonth { month: YearMonth; income: number; payments: number; soldToCover: number; uncovered: number; liquidValue: number; illiquidValue: number }
export type FundStatus = "ok" | "short-now" | "runs-out";
export interface FundCheckResult {
  status: FundStatus;
  runOutMonth: YearMonth | null;      // first month > today with uncovered > 0.005
  liquidToday: number;
  liquidAtEnd: number;
  endMonth: YearMonth | null;         // last month any Amplicon pays
  unallocatedCount: number;
  cappedMoveIds: string[];
  holdingsToday: Record<string, number>; // option id (incl. DEFAULT_GROWTH_ID) → total principal
  months: FundMonth[];
}
export function runFundCheck(input: FundCheckInput): FundCheckResult;
```
- Algorithm. `DEFAULT_GROWTH` is always added to the options. Each option holds `Lot[]`. Months run from `firstMonth` = min over Amplicons of `addMonths(startMonth, -1)` to `endMonth` = max of `addMonths(startMonth, termMonths - 1)`. With no Amplicons, return status "ok" with empty months and zeros. For each month `m`:
  1. **Deposits:** each Amplicon whose `addMonths(startMonth,-1) === m` adds a lot `{principal: faceValue × pct, startMonth: m}` per allocation. No allocations means 100% to `DEFAULT_GROWTH_ID`.
  2. **Moves** with `month === m`, in input order: the amount is capped at the source's total principal, and is 0 if the source is illiquid at `m`. Record the id in `cappedMoveIds` when it's capped. Reduce the source's lots proportionally and add the moved amount as a lot `{startMonth: m}` to the destination.
  3. **Step** every lot with `termsAt(option, m)`. Sum the cash into `income`. Drop closed lots.
  4. **Check-ins** with `month === m`: scale that option's lots so their principals sum to `value`. If there are no lots and `value > 0`, add `{principal: value, startMonth: m}`.
  5. **Payments:** `payments` = Σ `monthlyPayoutOf(a)` over Amplicons with `isActiveAt(a, m)`. If `income >= payments`, the surplus leaves the fund. Otherwise, sell from liquid options in ascending `termsAt(o,m).ratePct` order (ties: option id), reducing lots proportionally, until the shortfall is covered. Whatever's left is `uncovered`. Nothing carries forward.
  6. **Record** a `FundMonth`. Liquid and illiquid values use `termsAt(o, m).liquid`.
- **Status:** "short-now" if the month equal to `today` has `uncovered > 0.005`. Otherwise "runs-out" if any month after `today` does, with `runOutMonth` the first one. Otherwise "ok". **For `liquidToday` and `holdingsToday`:** if `today` falls between `firstMonth` and `endMonth`, use that month's row. If it's before `firstMonth`, use 0 and `{}`. If it's after `endMonth`, use the last month.

- [ ] **Step 1: Write the failing tests.** Fixtures: `idx0` (appreciation, 0%, infinite, liquid); `rent6` (interest_only, 6%, infinite, illiquid); `amp` is an STI with 12000 face, 0% and 12 months (payment 1000), startMonth "2026-02".
  - `fully covered by a liquid 0% holding`: amp → idx0, today "2026-01" → status "ok", `months[last].liquidValue` 0 (±1e-6), `liquidAtEnd` 0.
  - `illiquid income alone runs out in the first payment month`: amp → rent6, today "2026-01" → "runs-out", `runOutMonth` "2026-02".
  - `short this month`: same, today "2026-03" → "short-now".
  - `past shortfalls are ignored`: same, today "2027-06" → "ok", `runOutMonth` null.
  - `future Amplicon deposits only in its launch month` (Review Focus 1): amp starting "2027-02", today "2026-06" → "ok", and `months[0].month` is "2027-01".
  - `unallocated goes to Default growth at 10%`: amp with no allocations → `unallocatedCount` 1, status "ok", `holdingsToday["default-growth"]` > 0 at today "2026-06".
  - `split across two options`: 50% idx0 and 50% rent6 → "runs-out", `runOutMonth` "2026-08". Reason: rent6 pays 30 a month, so idx0 (6000) sells 970 a month for Feb–Jul (5820) and has only 180 left in Aug.
  - `move to an illiquid option runs it out`: amp → idx0, move of 12000 from idx0 to rent6 in "2026-02" → "runs-out" "2026-02".
  - `oversized move is capped` (Review Focus 2): a move of 50000 from idx0 in "2026-02" → `cappedMoveIds` contains its id, and no `FundMonth` has negative values.
  - `move before the source exists is capped to zero`: a move dated "2025-06" → capped, status unchanged from the no-move case.
  - `check-in of zero` (Review Focus 3): amp → idx0, check-in idx0 = 0 at "2026-05", today "2026-01" → "runs-out", `runOutMonth` "2026-05".
  - `check-in re-bases forward`: amp → idx0 at 0%, check-in idx0 = 100000 at "2026-03" → `liquidAtEnd` = 89000 (±1e-6). The check-in lands before March's payment, then 11 payments run from Mar 2026 to Jan 2027.
  - `sells the lowest rate first`: amp split 50/50 between idx0 and an `idx5` (appreciation 5%, liquid) → after "2026-02", idx0 has fallen and idx5 has not.
  - `an edit only changes later months`: rent6 has a second version at "2026-08" (appreciation, 0%, liquid). Months before "2026-08" have `illiquidValue` > 0, and months from "2026-08" have `illiquidValue` 0.
- [ ] **Step 2:** Run `pnpm vitest run src/shared/finance/fund-check.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `runFundCheck` exactly per the algorithm above.
- [ ] **Step 4:** Run the tests, then `pnpm vitest run src/shared/finance` (existing golden and invariant suites). Expected: all PASS, no snapshot changes.
- [ ] **Step 5: Commit** `feat(finance): runFundCheck replays the fund and flags shortfalls`

### Task 4: Investment options data layer

**Files:**
- Create: `src/features/investments/CLAUDE.md` (5–10 lines: what the feature is, that `null` option id = Default growth, the forward-only edit rule, the math-guard note)
- Create: `src/features/investments/data/parse.ts`, `parse.test.ts`
- Create: `src/features/investments/data/load.ts`
- Create: `src/features/investments/data/actions.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 3 types.
- Produces:
```ts
// parse.ts
export interface OptionFields { name: string; option_type: OptionType; rate_pct: number; term_months: number | null; liquid: boolean }
export function parseOptionForm(fd: FormData): OptionFields; // fields: name, option_type, rate_pct (points), term_infinite (checkbox), term_months, liquid (checkbox)
export function monthStart(ym: YearMonth): string; // "2026-11" → "2026-11-01"
// load.ts
export async function loadFundCheckInput(supabase: SupabaseClient<Database>, today: YearMonth): Promise<FundCheckInput & { optionUsage: Record<string, number> }>;
// actions.ts ("use server")
export async function createInvestmentOption(fd: FormData): Promise<void>;
export async function previewOptionEdit(fd: FormData): Promise<{ status: FundStatus; runOutMonth: YearMonth | null }>;
export async function editInvestmentOption(fd: FormData): Promise<void>;
export async function deleteInvestmentOption(fd: FormData): Promise<{ error: string | null }>;
```
- `parseOptionForm` throws "Missing or invalid required fields." for an empty name, an unknown type, a rate < 0 or > 100, or a finite term ≤ 0. `term_infinite` checked → `term_months: null`.
- `loadFundCheckInput` reads all five tables plus `amplicons`, maps the rows to `FundCheckInput` (`null` ids → `DEFAULT_GROWTH_ID`, dates → `isoToYearMonth`, `Number()` on numerics) and counts references per option id in `optionUsage` (splits + moves + check-ins).
- `createInvestmentOption`: insert the option, then insert one version with `effective_month = monthStart(currentYearMonth())`.
- `previewOptionEdit`: load, replace or append that option's version for the current month with the parsed terms, run `runFundCheck`, return status and month. Writes nothing.
- `editInvestmentOption`: update `name`, then upsert the version on `(option_id, effective_month)` for the current month. If the new version is illiquid and any `fund_moves` row has `from_option_id = id` and `move_month >= this month`, throw "This option has money moved out of it from {Mon YYYY}. Delete that move first." The action does not block on the fund status; the UI does the second click.
- `deleteInvestmentOption`: delete; on Postgres error code `23503`, return `{ error: "In use by a split, move or check-in. Remove those first." }`. All actions `revalidatePath("/investment-options")` and `revalidatePath("/dashboard")`.

- [ ] **Step 1: Write the failing tests** in `parse.test.ts`:
  - `parses an infinite illiquid interest-only option`: name "Oak St rental", option_type "interest_only", rate_pct "8", term_infinite "on", no liquid → `{ name, option_type, rate_pct: 0.08, term_months: null, liquid: false }`.
  - `parses a finite liquid amortized option` with term_months "60" → `term_months: 60`, `liquid: true`.
  - `rejects a bad type`, `rejects a zero finite term`, `rejects an empty name` → throw.
  - `monthStart("2026-11") === "2026-11-01"`.
  - `same-month edit upserts` (Review Focus 4): unit-test a pure helper `versionRow(optionId, userId, fields, month)` that returns the row with `effective_month` = `monthStart(month)`, and assert that the action calls `.upsert(row, { onConflict: "option_id,effective_month" })` by reading the actions source with `readFileSync` (the repo's existing pattern for SQL assertions).
- [ ] **Step 2:** Run `pnpm vitest run src/features/investments`. Expected: FAIL.
- [ ] **Step 3:** Implement `parse.ts` (export `versionRow` too), `load.ts` and `actions.ts`, plus `CLAUDE.md`.
- [ ] **Step 4:** Run the tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(investments): option CRUD with forward-only versions and the fund loader`

### Task 5: Moves and check-ins data layer

**Files:**
- Modify: `src/features/investments/data/parse.ts`, `parse.test.ts`, `actions.ts`

**Interfaces:**
- Produces:
```ts
export interface MoveFields { from_option_id: string | null; to_option_id: string | null; amount: number; move_month: string }
export function parseMoveForm(fd: FormData): MoveFields;       // fields: from, to ("default-growth" → null), amount, month ("YYYY-MM")
export interface CheckinFields { investment_option_id: string | null; value: number; checkin_month: string }
export function parseCheckinForm(fd: FormData, today: YearMonth): CheckinFields; // fields: option, value, month
export async function createFundMove(fd: FormData): Promise<void>;
export async function deleteFundMove(fd: FormData): Promise<void>;
export async function createCheckin(fd: FormData): Promise<void>;
export async function deleteCheckin(fd: FormData): Promise<void>;
```
- `parseMoveForm` throws on amount ≤ 0, from === to, or a missing month. `createFundMove` also loads the source's terms at that month with `termsAt` and throws "You can't sell an illiquid option." if it's illiquid.
- `parseCheckinForm` throws on value < 0 or a month after `today` ("A check-in can't be in the future.").

- [ ] **Step 1: Write the failing tests:** `maps default-growth to null`, `rejects a move to the same option`, `rejects a non-positive amount`, `rejects a future check-in`, `accepts a check-in of zero`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the parsers and the four actions (`user_id` scoping, `revalidatePath` as in Task 4).
- [ ] **Step 4:** Run the tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(investments): fund moves and value check-ins`

### Task 6: Investment options page

**Files:**
- Create: `src/app/(app)/investment-options/page.tsx`
- Create: `src/features/investments/ui/OptionForm.tsx` (create and edit; client component)
- Create: `src/features/investments/ui/OptionsTable.tsx`
- Create: `src/features/investments/ui/MovesCard.tsx`, `CheckinForm.tsx`
- Create: `src/features/investments/nav.ts` (`investmentOptionsNavItem = { to: "/investment-options", label: "Investment options", icon: Landmark }`)
- Modify: `src/app/(app)/Sidebar.tsx` (add the item after "Lines of Credit")

**Interfaces:**
- Consumes: Tasks 3–5.
- The page calls `loadFundCheckInput`, runs `runFundCheck`, and renders:
  - the options table: name, type, term ("Infinite" when null), rate, liquid, current value from `holdingsToday`, last check-in month, and Edit / Update value / Delete. Delete is disabled with the title "Used in {n} places" when `optionUsage[id] > 0`. A fixed Default growth row has only Update value.
  - the moves card: a list (month, from, to, amount, capped flag from `cappedMoveIds`, delete) and a "Move money" form whose From list contains only options liquid in the current month, plus Default growth.
- `OptionForm` edit flow: on submit, call `previewOptionEdit`. If the status is not "ok", show "With this change, your fund runs out of liquid money in {Mon YYYY}." (or "With this change, your fund can't cover this month.") and relabel the button "Save anyway". The second submit calls `editInvestmentOption`. Create calls `createInvestmentOption` directly. The form shows the term box only when "Infinite" is unticked.
- Follow the Card, Field and table classes used in `src/app/(app)/loc/page.tsx` and `features/amplicons/ui/AmpliconFields.tsx`.

- [ ] **Step 1:** Build the components and page.
- [ ] **Step 2:** Run `pnpm typecheck && pnpm test`, including `src/boundaries.test.ts`. Expected: PASS.
- [ ] **Step 3:** Run `pnpm dev`, sign in, and add an option, edit it into a shortfall (the warning and "Save anyway" appear), add a move and a check-in, and try deleting an option in use (blocked). Expected: each behaves as described.
- [ ] **Step 4: Commit** `feat(investments): investment options tab with moves and check-ins`

### Task 7: Amplicon split

**Files:**
- Modify: `src/features/amplicons/data/parse.ts`, `parse.test.ts`, `actions.ts`
- Create: `src/features/amplicons/ui/AllocationFields.tsx`
- Modify: `src/features/amplicons/ui/AmpliconFields.tsx`, `NewAmpliconForm.tsx`, `AmpliconRow.tsx` (thread an `options: { id: string; name: string }[]` prop and the current `allocations`)
- Modify: `src/app/(app)/amplicons/page.tsx` (load options and allocations, pass them down)

**Interfaces:**
- Produces:
```ts
export interface AllocationField { investment_option_id: string; pct: number } // decimal
export function parseAllocations(fd: FormData): AllocationField[]; // fields alloc_option_0..2, alloc_pct_0..2 (points)
```
- Rows with an empty option are skipped, and no rows returns `[]`. Throws "Split must add up to 100%." when `|Σpct − 1| > 0.0001`, "Use each investment once." on a duplicate, and "Each share must be above 0%." when pct ≤ 0.
- `createAmplicon`: insert with `.select("id").single()`, then insert the allocations. `editAmplicon`: update, delete the old allocations for that `amplicon_id`, insert the new ones. `duplicateAmplicon`: copy the allocations to the new id. Every allocation row carries `user_id`.
- `AllocationFields`: three rows (option select + % input), a live total, and the submit disabled unless the total is 100% or no rows are filled. When it's empty, show "Not split yet: counted as Default growth (10%)."

- [ ] **Step 1: Write the failing tests:**
  - `no rows is an empty split`
  - `parses a 60/40 split`
  - `accepts rounding` (Review Focus 5): 33.333 + 33.333 + 33.334 → OK; 99.995 total → OK
  - `rejects 99.9%`
  - `rejects a duplicate option`
  - `rejects a zero share`
- [ ] **Step 2:** Run `pnpm vitest run src/features/amplicons`. Expected: FAIL.
- [ ] **Step 3:** Implement the parser, actions and UI. The options list reaches the UI through props from `app/`; nothing in `features/amplicons` imports `features/investments`.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test`. Expected: PASS (boundaries included).
- [ ] **Step 5: Commit** `feat(amplicons): split face value across up to three investment options`

### Task 8: Dashboard fund-check card

**Files:**
- Create: `src/features/investments/ui/FundCheckCard.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (load with `loadFundCheckInput`, run `runFundCheck`, render the card directly above `<ChartPair>`, after the slips block)

**Interfaces:**
- `FundCheckCard({ result }: { result: FundCheckResult })`:
  - **"short-now":** a red line, "Can't cover this month."
  - **"runs-out":** an amber line, "Runs out of liquid money in {fmtMonth(runOutMonth)}."
  - **"ok":** a quiet line, "Liquid fund today {fmtUSD0(liquidToday)}; at the end of the schedules ({fmtMonth(endMonth)}) {fmtUSD0(liquidAtEnd)}."
  - **When `unallocatedCount > 0`:** add "{n} Amplicon(s) assumed in Default growth (10%)."
  - **With no Amplicons:** render nothing.
  - Use the same card classes as the slips block in `dashboard/page.tsx`.
- No existing dashboard variable, prop or calculation changes.

- [ ] **Step 1:** Implement the card and wire it in.
- [ ] **Step 2:** Run `pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] **Step 3:** Run `pnpm dev`. Check the dashboard with today's data (no splits): one quiet line plus "{n} Amplicons assumed in Default growth (10%)". Then add a split to an illiquid 0% option and confirm the amber or red line. Expected: as described, with every other dashboard number identical to before.
- [ ] **Step 4: Commit** `feat(dashboard): fund check beside the projection`

### Task 9: Docs and final verification

**Files:**
- Modify: `docs/PRODUCT-STATUS.md` (§4: the five tables. §5: `fund-check.ts`. §7: the `/investment-options` route)
- Modify: `CLAUDE.md` (add `investments/` to "The small features")
- Modify: `src/shared/finance/CLAUDE.md` (add a `fund-check.ts` row)

- [ ] **Step 1:** Update the three docs.
- [ ] **Step 2:** Run `pnpm test && pnpm typecheck && pnpm build`. Expected: all pass. `git diff main --stat -- src/shared/finance/projection-sim.ts src/shared/finance/sim-*.ts src/shared/finance/projection.ts src/shared/finance/projection-fi.ts src/shared/finance/dashboard-seed.ts src/shared/finance/amortization.ts src/features/dashboard/projection.ts src/features/compare src/features/simulator` prints nothing.
- [ ] **Step 3: Commit** `docs: investment options and the fund check`
- [ ] **Step 4:** Leave the branch for Miguel. Don't push, open a PR or apply the migration without his go-ahead.

---

## Revision 2026-11-10b

Spec: the "Revision 2026-11-10b" section of the spec. Migration 0019 has not been applied anywhere, so it is edited in place.

### Task 10: Migration revision
- `0019`: add `unique (id, user_id)` on `investment_options` and (via `alter table public.amplicons add constraint amplicons_id_user_id_key unique (id, user_id)`) on `amplicons`. Composite FKs `(x_id, user_id)` on versions, allocations, moves, check-ins. A new `amplicon_splits(id, user_id, amplicon_id, created_at)` with `(amplicon_id, user_id) → amplicons on delete cascade`. `amplicon_allocations.split_id` replaces `amplicon_id`. Splits and allocations are select/insert only. Moves and check-ins are select/insert/update, plus `stranded_at timestamptz`. `save_amplicon_split(p_amplicon_id uuid, p_allocations jsonb) returns uuid`, `security invoker`.
- Tests: in `0019_investment_options.test.ts`, 6 tables; composite FKs present; no delete policy on splits, allocations, moves or check-ins; the function is `security invoker`; the only alter on an existing table is the amplicons unique constraint.

### Task 11: Engine — stranding and "worse"
- In `fund-check.ts`: `FundMove.stranded?: boolean` (the destination becomes Default growth); `FundCheckin.stranded?: boolean` (after the rescale, the whole holding moves to Default growth); `FundCheckin.id?: string`. `isWorse(before, after): boolean`, where status ranks ok 0 < runs-out 1 < short-now 2, and an earlier `runOutMonth` at equal rank is worse.
- Tests: a stranded move ends up in Default growth (status "ok" where the unstranded move to rent6 runs out); a stranded check-in empties the holding into Default growth; `isWorse` table.

### Task 12: Data — split versions, strand actions, preview
- `amplicons/data/allocations.ts`: `saveSplit(supabase, ampliconId, allocs)` → RPC `save_amplicon_split`; a no-op when equal to the current version (pure `sameSplit(a, b)`, tested); a no-op on a missing function or table when `allocs` is empty. `restoreSplit(fd)` action. `duplicateAmplicon` copies the current version.
- `investments`: `strandFundMove`, `strandCheckin` (update `stranded_at`, only where null) replace the delete actions; `previewOptionEdit` returns `{ worse, status, runOutMonth }`. The loader reads the current split per Amplicon, plus stranded flags and check-in ids; usage counts allocation rows across all versions.

### Task 13: UI
- AmpliconRow: Undo (when there are ≥ 2 versions) and History (each version's date and summary, with Restore).
- MovesCard / new CheckinsCard: delete → inline confirmation "This can't be undone. The money stays out of {source} and moves to Default growth." Stranded rows are shown muted.
- OptionForm: "Save anyway" only when `worse`.

### Task 14: Local Supabase
- Outside the repo: `../amplifica-local-db` (Supabase CLI project). A script copies `supabase/migrations/*.sql` with sequential version prefixes (the repo has duplicate `0008`–`0018` prefixes the CLI rejects). `supabase start`. The worktree gets an untracked `.env.development.local` pointing at it.
