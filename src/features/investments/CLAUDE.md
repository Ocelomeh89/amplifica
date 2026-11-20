# features/investments — investment options and the fund check

The user's real investments (amortized, interest-only, appreciation), dated
fund moves, value check-ins, and the fund-check card on the dashboard.
Spec: `docs/superpowers/specs/2026-11-10-investment-options-fund-check-design.md`.

- The math is `shared/finance/fund-check.ts`. This feature only loads and saves.
- A `null` option id in `fund_moves` / `holding_checkins` means **Default growth**
  (`DEFAULT_GROWTH_ID`), a code constant: 10% appreciation, infinite, liquid.
- Option edits look **forward only**: each one upserts a version dated the
  first of the current month. Never rewrite an older version.
- The fund check is warning-only. Nothing here may change a flywheel number.
- `features/amplicons` gets the option list as props from `app/`, never by importing this feature.
- **Gated** to the user ids in `INVESTMENTS_USER_IDS` (`shared/investments-access.ts`): the sidebar tab, the
  page (404), every action here, the Amplicon split fields and actions, and the dashboard fund card + chart.
  Unset means nobody sees it. Allow-listed users get a "My view / Everyone else" toggle
  at the top of every app page (`app/(app)/ViewToggle.tsx`, cookie `amp_view`); pages and actions read
  `investmentsOn()` from `shared/view-mode.ts`, which honours it.
