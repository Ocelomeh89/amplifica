# features/simulator — the shared simulator UI

The flywheel simulator's inputs, results and charts. **The one feature other
features may import** — it is used by both `features/projections` (the logged-in
editor) and `features/calculator` (the public email-gated page), and is named in
the `SHARED_FEATURES` allowlist in `src/boundaries.test.ts`.

It is UI only. The math lives in `src/shared/finance/` — see its CLAUDE.md.

| File | What |
|---|---|
| `useSimulation.ts` | The hook: 12 input values, a 200ms debounce, memoized engine runs. Entry point. |
| `sim-values.ts` | The `SimValues` UI shape, the `toSimInput` / `projectionToSimValues` mappers, and `PUBLIC_DEFAULT_VALUES`. |
| `SimInputsGrid.tsx` | The input grid. Its `name=` attributes **are** the `updateProjection` FormData contract — renaming one silently breaks saving. |
| `SimResults.tsx` | Readouts, including the financial-optionality card. |
| `SimCharts.tsx` | Recharts output. |
| `FlywheelExplainer.tsx` | Static explanatory copy. |

## Gotchas

- **Two surfaces, one component set.** The public calculator renders a reduced
  set (`advanced="hidden"`): the expert inputs are not rendered at all, and the
  engine runs on defaults for them. Check both callers before changing props.
- In the projection editor the Advanced fields are **CSS-hidden, not
  unmounted**, so the save FormData still posts them. Unmounting them would
  silently drop those columns on save.
- UI copy says "financial optionality"; the engine still says `projection-fi`.
  That rename was deliberate and copy-only.
