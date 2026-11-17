# Investment options and the fund check: design

Status: ready for review, 2026-11-10.

## Why

An Amplicon's face value does two jobs.

1. **The schedule.** The rate and term Miguel picks set the monthly payment he pays himself back to the line of credit. The app models this today, and the flywheel projection runs on it.
2. **The deployment.** When an Amplicon starts, its face value goes into a real investment fund, where it earns real returns. Every Amplicon's cash ends up in one shared fund.

The fund has to throw off enough cash to cover every Amplicon payment, month after month. The cash comes from income (dividends, interest, rent) or from selling liquid holdings. Some holdings, such as a single-family rental, can't be sold; only their income is usable. Today the app has no way to see whether the fund can carry the schedules. This feature adds that view.

## Goals

- A new **Investment options** tab where the user sets up the investments they actually hold.
- An Amplicon can say where its face value went: split across up to 3 investment options, adding up to 100%.
- **Fund moves**: record "move $X from option A to option B on date D".
- A **fund check** shown next to the dashboard projection, which warns when the fund can't cover the payments.

## Non-goals

- **No change to the flywheel math.** `runSimulation`, the dashboard projection, the optionality month and every number they produce stay exactly as they are. The fund check is a separate calculation that reads the same Amplicon schedules and writes nothing back. (⚠️ Math guard: no engine output moves. Before merge, confirm with the golden suites that nothing changed.)
- **No editing of the past.** Past cash flows are fixed, and past shortfalls in the replay are ignored. Warnings only look from the current month forward.
- No tax treatment, fees, or volatility. The rates are flat and deterministic.
- Nothing in `/content`, `leads`, `quiz_submissions` or the public calculator.

## Anti-goals

- The fund running down over time must **not** warn. The Amplicons are built to pay out their principal, so a shrinking fund is the design working.
- The check must never fire on missing data. An Amplicon with no split gets the default holding (below); it doesn't trigger a warning.

## Data model

### New table: `investment_options`

User-owned, with RLS self CRUD, `user_id` scoping and the `touch_updated_at` trigger, the same pattern as `locs`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users, cascade | |
| `name` | text | e.g. "Oak St rental", "VTI" |
| `option_type` | text, check in (`'amortized'`, `'interest_only'`, `'appreciation'`) | |
| `term_months` | integer, null = infinite, check > 0 | |
| `rate_pct` | numeric(7,6), annual decimal, check ≥ 0 | same convention as `amplicons.interest_pct` |
| `liquid` | boolean | |
| timestamps | | |

The three types:

- **Amortized:** pays a standard amortizing payment (`monthlyPayment(principal, rate, term)` from `shared/finance/amortization.ts`) over its term, so the principal winds down to zero. The whole payment counts as cash, interest and returned principal alike. An infinite term means the payment is principal × rate ÷ 12 forever (the limit of the formula).
- **Interest-only:** pays principal × rate ÷ 12 each month. The principal comes back as cash when the term ends; with an infinite term it never does. Example: a single-family rental is interest-only, infinite, not liquid.
- **Appreciation:** no income. The balance compounds at rate ÷ 12 a month. Example: an index fund.

Liquid holdings can be sold down to cover a shortfall. Illiquid holdings only contribute their income, plus principal returned at the end of a finite term.

### The default holding

A built-in system option, **"Default growth"**: appreciation, 10%, infinite term, liquid. It isn't a row the user can edit or delete; it lives as a constant in code. Any Amplicon with no split is treated as 100% invested here. Every Amplicon that exists today has no split.

### New table: `amplicon_allocations`

Where an Amplicon's face value went when it launched.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users, cascade | defense-in-depth scoping, like every user table |
| `amplicon_id` | uuid → amplicons, **cascade** | deleting an Amplicon deletes its split |
| `investment_option_id` | uuid → investment_options, **restrict** | an option in use can't be deleted |
| `pct` | numeric(5,4), check > 0 and ≤ 1 | |

Rules, enforced in the server action and covered by its tests:

- At most 3 rows per Amplicon.
- The percentages sum to exactly 1, with a tolerance of 0.0001.
- No option repeated within one Amplicon.
- Zero rows is allowed and means the default holding.

### New table: `fund_moves`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users, cascade | |
| `from_option_id` | uuid → investment_options, restrict; **null = Default growth** | |
| `to_option_id` | uuid → investment_options, restrict; null = Default growth | |
| `amount` | numeric(14,2), check > 0 | |
| `move_date` | date | applied in that month |

Nobody may move money out of an illiquid option, since it can't be sold. Moves *into* one are fine; that's buying it.

### Editing an option looks forward only

Changing an option's type, rate, term or liquid flag is a decision about where the money goes next. It never rewrites the past. Each edit is stored as a new version with an effective month, the month of the edit. The fund check uses the version that was in effect in each month.

This needs an `investment_option_versions` child table (option_id, effective_month, option_type, rate_pct, term_months, liquid). `investment_options` then keeps only `id`, `user_id` and `name`. The builder may choose a different storage shape if it gives the same behavior.

**Before an edit is saved**, the form re-runs the fund check with the new version and shows the result. Example: "With this change, your fund runs out of liquid money in Aug 2029." The edit is allowed if the projected payments are still covered. If they aren't, show the warning and require a second click. Don't block.

An edit that makes an option illiquid applies from its effective month. Moves out of it dated before that month stay valid. Moves out of it dated after that month are rejected.

### Liquid means sellable, for every type

Any liquid holding, Amortized included, can be sold to cover a shortfall and appears in the "Move money" From list. "Liquid money" in the warnings means the sum of every liquid holding.

### Amplicon splits stay editable

An Amplicon's split can be edited after launch. It's a correction to the record of where the money went, so it does apply to past months. Duplicating an Amplicon copies its split.

### New table: `holding_checkins`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users, cascade | |
| `investment_option_id` | uuid → investment_options, restrict; **null = Default growth** | |
| `value` | numeric(14,2), check ≥ 0 | the holding's actual value |
| `checkin_month` | date (first of month) | not in the future |

Shown on the Investment options tab: each option row has an "Update value" action next to its derived current value, and shows the last check-in date.

### Deletion rule

An investment option can't be deleted while any `amplicon_allocations` row or any `fund_moves` row references it. The `restrict` foreign keys enforce this in the database. The UI disables Delete and says where the option is used.

## The fund check (calculation)

This is a new pure module in `shared/finance/`, so it gets the same no-I/O and boundary rules as the engine. It takes the tracked Amplicons, their splits, the options and the moves, and runs month by month from the earliest Amplicon start to the last month any tracked Amplicon schedule pays.

**Holdings.** Each investment option, plus Default growth, holds one pooled holding. One exception: Amortized and finite-term Interest-only holdings are tracked as **lots**, one per deposit (an Amplicon launch or an incoming move), because each lot has its own payment schedule and maturity date. Appreciation and infinite-term Interest-only holdings can be a single balance.

**Each month m, in this order:**

1. **Deposits:** each Amplicon that launches this month adds face value × pct to each of its options. Launch month = the month before its `start_date`, matching the engine's draw-then-first-payment convention.
2. **Moves dated this month:** sell from the source holding and buy into the destination. A move larger than the source's balance is capped at the balance and flagged on the page.
3. **Growth and income:**
   - Appreciation balances grow by × (1 + rate/12).
   - Interest-only holdings pay balance × rate/12.
   - Amortized lots pay their scheduled payment.
   - Finite-term lots that mature this month return their remaining principal as cash.
4. **Payments due:** the sum of every tracked Amplicon's payment for month m, using the existing `monthlyPayoutOf` / `isActiveAt` from `shared/finance/projection.ts`, so this is the same schedule the dashboard already shows.
5. **Cover the payments:**
   - Income and returned principal go first.
   - Any **surplus** stays in the fund *(revised 2026-11-17)*. It is reinvested across the holdings in proportion to each one's value after the month's payments, illiquid ones included, and starts earning the next month. If nothing is left in the fund, it all goes to Default growth. Recorded as `reinvested`.
   - Any **shortfall** is covered by selling liquid Appreciation and liquid Interest-only holdings. Order: lowest-rate holding first, so the best earners are kept *(builder's call, changeable)*.
6. **Record the month:** fund value (liquid and illiquid), income, payments, shortfall covered by sales, and any shortfall still uncovered.

**Past months.** Months before the current one are replayed only to arrive at today's balances. A shortfall that can't be covered in a past month is not carried forward: the next month starts from whatever is left, never below zero. No warning or note reports a past shortfall.

**Value check-ins.** The user can record the actual current value of any holding: an option, or Default growth, with a value and a month. For that holding, the replay discards its derived balance at the check-in month and continues from the recorded value. The latest check-in per holding wins, and earlier ones only matter for months before it. Appreciation holdings (index funds) are the main case, but any type can be checked in.

*Builder's call:* for a lot-based holding (Amortized or finite Interest-only), a check-in scales every open lot proportionally, so their total equals the recorded value. Each lot keeps its own remaining schedule.

**Scope of "the schedule":** the Amplicons the user has recorded, including future-dated ones with their splits. Draws the flywheel projection only *imagines* (future relaunches) are not in the fund check.

**Warnings**, shown next to the projection on the dashboard:

- **Red: "Can't cover this month."** In the current month, income plus every liquid dollar is less than the month's payments.
- **Amber: "Runs out of liquid money in {Month YYYY}."** The first future month where a shortfall can't be covered, before the last schedule ends.
- **No warning** when the fund only shrinks. The block then shows a quiet line: liquid fund value today and at the end of the schedules.
- If any Amplicons are on the default holding, the block says so: "3 Amplicons assumed in Default growth (10%)". This tells the user, without warning them.

## Screens

- **Investment options tab** (`/investment-options`, a new sidebar item). Holds a list of options with name, type, term ("Infinite" when null), rate and liquid. It has a New and Edit form like the LoC screen, and Delete is disabled while the option is in use.
  - Below the list are **fund moves**: a list plus a "Move money" form with from, to, amount and month. "From" lists only liquid options and Default growth.
  - The tab also shows the derived current holdings per option, so the user can see what they're moving from.
- **Amplicon form.** Adds an "Invested in" section with up to 3 rows (option + %), a live total, and save blocked unless it reaches 100%. Leaving it empty means Default growth, and the form says so.
- **Dashboard.** Adds a fund-check block beside the projection (exact placement is the builder's call), in the same card style as the existing slips and over-limit notes.

## Code placement

- A new feature `src/features/investments/` (data actions, parse, UI), following `features/loc/`. The Amplicon form imports the option list through a server-side query in `app/`, not by importing the feature, so the boundaries in `src/boundaries.test.ts` still pass. The builder may instead move the shared shape into `shared/` if that's cleaner.
- The fund-check math lives in `src/shared/finance/fund-check.ts`, with tests beside it, including a golden case: a rental at 8% interest-only illiquid plus an index fund at 10% appreciation liquid, against two STIs.
- Migration `0019_investment_options.sql` adds the five new tables (options, option versions, allocations, moves, check-ins) and updates `database.types.ts`.

## Decided by Miguel

- Three option types: amortized, interest-only, appreciation. Term can be infinite. Liquid yes/no.
- An Amplicon split has up to 3 options and must sum to 100%.
- Income covers the payments first; surplus is reinvested in the fund by its current split (revised 2026-11-17); liquid principal is sold only to cover a gap.
- Illiquid holdings contribute income only.
- Unallocated Amplicons default to appreciation at 10%, infinite, liquid.
- Warn on (a) can't cover this month, (b) projected to run out of liquid money before the schedules finish. Shrinking is expected and not a warning.
- Balances are derived from what was put in, unless the user checks in a holding's actual current value. The projection then continues from that value. This matters most for index funds.
- Past cash flows are never edited. Past shortfalls don't matter.
- An edit that leaves payments uncovered warns and needs a second click. It is not blocked.
- The fund is pooled. After launch, no Amplicon is tied to a holding. Re-allocation is a dated move from A to B.
- An option can't be deleted while in use.
- The warning sits next to the projection.
- Editing an option only looks forward. It must show whether projected payments are still covered.
- Liquid means sellable for every type, Amortized included.
- Amplicon splits stay editable after launch, as corrections. Duplicate copies the split.

## Builder's calls (changeable)

- Lowest-rate-first sell order.
- Default growth as a code constant rather than a seeded row.
- Lots for amortized and finite interest-only holdings.
- A check-in on a lot-based holding scales its open lots proportionally.
- Option edits stored as dated versions (`investment_option_versions`).
- Oversized moves capped and flagged rather than rejected.
- The route name and exact UI layout.

## Later

- ~~Feeding fund surplus into the flywheel projection.~~ Decided 2026-11-17: surplus stays in the fund instead; the flywheel is still untouched.
- Volatility or stress scenarios for appreciation holdings.

## Revision 2026-11-10b (decided by Miguel after the first build)

1. **Split history with undo.** A split is never deleted or overwritten. Every save is a new version (`amplicon_splits` header + `amplicon_allocations` rows), written atomically by the `save_amplicon_split` database function. A version with no rows means Default growth. Saving a split identical to the current one writes nothing. **Undo** restores the previous version, and **History** can restore any version, by saving it again as a new version. The fund check uses the current version for the Amplicon's whole life.
2. **Per user, enforced in the database.** Composite foreign keys on `(id, user_id)` ensure every version, split, allocation, move and check-in points only at the same user's options and Amplicons. Splits and allocations are insert-only (no update or delete policy). Because history keeps every option a split ever used, an option that has appeared in any split version can't be deleted.
3. **Warn only if it gets worse.** The edit preview runs the fund check with and without the edit. "Save anyway" appears only when the edit makes the status worse (ok → runs out → short this month), or brings the run-out month earlier.
4. **Deleting a move or check-in strands the money in Default growth.** Nothing is deleted: the row gets `stranded_at`.
   - **Stranded move:** the amount still leaves the source in its month and lands in Default growth.
   - **Stranded check-in:** the holding is still set to the checked-in value in that month, then its whole value moves to Default growth.
   - The UI asks first: "This can't be undone." Stranded rows stay listed, marked.
5. **Local testing.** A local Supabase (Docker) with migrations 0001–0019, so the branch can be exercised without touching production.
